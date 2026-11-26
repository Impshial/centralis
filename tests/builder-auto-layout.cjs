const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ELK = require('../node_modules/.cache/lexicon/canvas-vendor/elk.js');

const source = fs.readFileSync('flow-canvas.js', 'utf8');
class TestELK {
  layout(graph) { return new ELK().layout(JSON.parse(JSON.stringify(graph))); }
}
const context = vm.createContext({window: {ELK: TestELK}, console});
vm.runInContext(`const DEFAULT_UNIVERSE_FORMAT = {nodeLayoutGap: 12};
  const DEFAULT_NOTE_WIDTH = 280, DEFAULT_NOTE_HEIGHT = 180;
  ${source.slice(source.indexOf('  function estimateNodeSize('), source.indexOf('  async function saveNodePositions('))}
  globalThis.layout = createAutoLayout;
  globalThis.fallback = createColumnAutoLayout;
  globalThis.edges = getLayoutEdges;
  globalThis.size = estimateNodeSize;
  globalThis.absolutePosition = getAbsoluteNodePosition;`, context);

const element = (id, x, y, parentId) => ({id, position: {x,y}, parentId, width: 236, height: 170, data: {kind: 'element', name: id}});
const group = (id, x, y, height = 1000, parentId) => ({id, position: {x,y}, parentId, style: {width: 324, height}, data: {kind: 'group'}});
function fixture() {
  return {
    nodes: [
      {...element('universe',0,100), data: {kind: 'universe'}},
      group('regions',400,0),
      element('Frostveil',44,72,'regions'), element('Oakreach',44,302,'regions'),
      element('Orrath',44,532,'regions'), element('Thalewynd',44,762,'regions'),
      element('Caldreth',900,230), element('Glacimor',900,530), element('Stormhaven',900,0)
    ],
    edges: [
      ...['Frostveil','Oakreach','Orrath','Thalewynd'].map(id => ({id:`root-${id}`,source:'universe',target:id})),
      {id:'city-c',source:'Thalewynd',target:'Caldreth'},
      {id:'city-g',source:'Frostveil',target:'Glacimor'},
      {id:'city-s',source:'Oakreach',target:'Stormhaven'}
    ]
  };
}
function assertAligned(nodes, left, right) {
  const byId = new Map(nodes.map(node => [node.id,node]));
  const a = byId.get(left), b = byId.get(right);
  const pa = context.absolutePosition(a,byId), pb = context.absolutePosition(b,byId);
  assert.ok(pb.x > pa.x + a.width, `${right} is to the right of ${left}`);
  const difference = Math.abs(pa.y + a.height / 2 - pb.y - b.height / 2);
  assert.ok(difference <= 12, `${right} aligns with ${left} (difference ${difference}px)`);
}

function assertNoOverlaps(nodes) {
  const roots = nodes.filter(node => !node.parentId && node.data.kind !== 'note');
  for (let i = 0; i < roots.length; i++) {
    for (const b of roots.slice(i + 1)) {
      const a = roots[i], sa = context.size(a), sb = context.size(b);
      assert.ok(a.position.x + sa.width <= b.position.x || b.position.x + sb.width <= a.position.x ||
        a.position.y + sa.height <= b.position.y || b.position.y + sb.height <= a.position.y,
      `${a.id} and ${b.id} do not overlap`);
    }
  }
}

function assertSameColumn(nodes, ids) {
  const xs = nodes.filter(node => ids.includes(node.id)).map(node => node.position.x);
  assert.equal(new Set(xs).size,1,`${ids.join(', ')} share a left edge: ${xs}`);
}

(async () => {
  const {nodes,edges} = fixture();
  const before = JSON.stringify(nodes);
  for (const layout of [context.layout, context.fallback]) {
    const result = await layout(nodes,edges);
    assertAligned(result,'Frostveil','Glacimor');
    assertAligned(result,'Thalewynd','Caldreth');
    assertAligned(result,'Oakreach','Stormhaven');
    assertNoOverlaps(result);
    assertSameColumn(result,['Caldreth','Glacimor','Stormhaven']);
    for (const node of nodes.filter(node => node.parentId)) {
      assert.equal(JSON.stringify(result.find(n => n.id === node.id).position),JSON.stringify(node.position),'Group contents retain relative positions');
    }
    assert.equal(JSON.stringify(nodes),before,'Layout does not mutate its input');

    const ungrouped = nodes.filter(node => node.id !== 'regions').map(node => node.parentId
      ? {...node,parentId:undefined,position:{x:400,y:node.position.y}} : node);
    // Different widths and nodes without outgoing links must not stagger the left edge.
    ungrouped.find(node => node.id === 'Oakreach').width = 280;
    ungrouped.find(node => node.id === 'Orrath').width = 234;
    const ungroupedResult = await layout(ungrouped,edges);
    assertSameColumn(ungroupedResult,['Frostveil','Oakreach','Orrath','Thalewynd']);
    assertAligned(ungroupedResult,'Frostveil','Glacimor');
    assertAligned(ungroupedResult,'Thalewynd','Caldreth');
    assertNoOverlaps(ungroupedResult);

    // The source endpoint can be several levels inside an expanded group.
    const nested = nodes.map(node => node.id === 'regions' ? {...node,parentId:'outer',position:{x:44,y:72}} : node);
    nested.unshift({...group('outer',400,0,1150),style:{width:420,height:1150}});
    const nestedResult = await layout(nested,edges);
    assertAligned(nestedResult,'Frostveil','Glacimor');
    assertAligned(nestedResult,'Thalewynd','Caldreth');
    assertNoOverlaps(nestedResult);

    // Expanded groups at both ends keep separate links for different member pairs.
    const bothGrouped = nodes.map(node => ['Caldreth','Glacimor','Stormhaven'].includes(node.id)
      ? {...node,parentId:'cities',position:{x:44,y:{Caldreth:762,Glacimor:72,Stormhaven:302}[node.id]}} : node);
    bothGrouped.push(group('cities',900,0));
    const groupedEdges = context.edges(bothGrouped,edges);
    assert.equal(groupedEdges.filter(edge => edge.source === 'regions' && edge.target === 'cities').length,3);
    const bothResult = await layout(bothGrouped,edges);
    assertAligned(bothResult,'Frostveil','Glacimor');
    assertAligned(bothResult,'Thalewynd','Caldreth');
    assertNoOverlaps(bothResult);

    const collapsed = nodes.map(node => node.id === 'regions'
      ? {...node,style:{width:260,height:96},data:{...node.data,collapsed:true}} : node);
    const collapsedResult = await layout(collapsed,edges);
    assertNoOverlaps(collapsedResult);
    const outgoing = context.edges(collapsed,edges).filter(edge => edge.source === 'regions');
    assert.equal(new Set(outgoing.map(edge => edge.sourcePort.id)).size,1,'Collapsed group uses one visible handle');
    assert.equal(outgoing[0].sourcePort.y,48);

    // Dense/cyclic graphs still produce finite, non-overlapping positions.
    const dense = await layout(ungrouped,[...edges,
      {id:'shared-city',source:'Oakreach',target:'Glacimor'},
      {id:'back-link',source:'Caldreth',target:'Thalewynd'}]);
    assertNoOverlaps(dense);
    assert.ok(dense.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
    assert.equal((await layout([],[])).length,0);
  }
  // The fallback is also used when ELK is unavailable.
  context.window.ELK = null;
  assertAligned(await context.layout(nodes,edges),'Frostveil','Glacimor');
  console.log('Auto-layout passed: grouped/ungrouped alignment, shared left edges, nested/collapsed groups, separate member links, collision avoidance, fallback and immutable inputs.');
})().catch(error => {console.error(error);process.exitCode=1;});
