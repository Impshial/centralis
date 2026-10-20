import datetime as dt
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "scripts/backups/worker.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class BackupTests(unittest.TestCase):
    def test_dst_and_duplicate_days(self):
        self.assertFalse(w.daily_due(dt.datetime(2026, 1, 5, 7, tzinfo=w.UTC), True, None))
        self.assertTrue(w.daily_due(dt.datetime(2026, 1, 5, 8, tzinfo=w.UTC), True, None))
        self.assertTrue(w.daily_due(dt.datetime(2026, 7, 5, 7, tzinfo=w.UTC), True, None))
        self.assertFalse(w.daily_due(dt.datetime(2026, 7, 5, 8, tzinfo=w.UTC), True, dt.datetime(2026, 7, 5, 7, tzinfo=w.UTC)))
        self.assertFalse(w.daily_due(dt.datetime(2026, 7, 5, 8, tzinfo=w.UTC), False, None))

    def test_retention_stays_in_backup_prefix(self):
        prefix = "centralis/v1/2026-10-20/11111111-1111-1111-1111-111111111111/"
        self.assertTrue(w.safe_prefix(prefix))
        for bad in ["", "centralis/", "../", prefix + "../", "images/important/"]:
            self.assertFalse(w.safe_prefix(bad))
        db, s3 = Mock(), Mock()
        db.execute.return_value.fetchall.return_value = [{"id": "bad", "backup_prefix": "images/important/"}]
        with self.assertRaises(RuntimeError):
            w.apply_retention(db, s3, 30, "current")
        s3.delete_objects.assert_not_called()

    def test_public_bucket_repaired_and_verified(self):
        for group in ("AllUsers", "AuthenticatedUsers"):
            with self.subTest(group=group):
                s3 = Mock()
                s3.get_bucket_acl.side_effect = [
                    {"Grants": [{"Grantee": {"URI": f"http://acs.amazonaws.com/groups/global/{group}"}}]},
                    {"Grants": []},
                ]
                s3.get_bucket_policy.return_value = {"Policy": '{"Statement":[]}'}
                w.check_private_bucket(s3)
                s3.put_bucket_acl.assert_called_once_with(Bucket="centralis-backups", ACL="private")
                self.assertEqual(s3.get_bucket_acl.call_count, 2)
                for call in s3.get_bucket_acl.call_args_list:
                    self.assertEqual(call.kwargs, {"Bucket": "centralis-backups"})

    def test_public_bucket_repair_must_succeed(self):
        s3 = Mock()
        s3.get_bucket_acl.return_value = {"Grants": [{"Grantee": {"URI": "http://acs.amazonaws.com/groups/global/AllUsers"}}]}
        with self.assertRaisesRegex(RuntimeError, "still grants public access"):
            w.check_private_bucket(s3)
        s3.get_bucket_policy.assert_not_called()
        s3.put_bucket_acl.side_effect = w.ClientError({"Error": {"Code": "AccessDenied"}}, "PutBucketAcl")
        with self.assertRaisesRegex(RuntimeError, "Cannot make centralis-backups private"):
            w.check_private_bucket(s3)

    def test_logging_grant_is_not_public(self):
        s3 = Mock()
        s3.get_bucket_acl.return_value = {"Grants": [{"Grantee": {"URI": "http://acs.amazonaws.com/groups/s3/LogDelivery"}}]}
        s3.get_bucket_policy.return_value = {"Policy": '{"Statement":[]}'}
        w.check_private_bucket(s3)
        s3.put_bucket_acl.assert_not_called()

    def test_public_policy_rejected(self):
        s3 = Mock()
        s3.get_bucket_acl.return_value = {"Grants": []}
        s3.get_bucket_policy.return_value = {"Policy": '{"Statement":[{"Effect":"Allow","Principal":"*"}]}'}
        with self.assertRaisesRegex(RuntimeError, "policy must not grant public access"):
            w.check_private_bucket(s3)

    def test_incomplete_copy_rejected(self):
        s3 = Mock()
        s3.get_paginator.return_value.paginate.return_value = [{"Contents": [{"Key": "file", "Size": 10, "ETag": "version1"}]}]
        s3.head_object.return_value = {"ContentLength": 5, "ETag": "version1"}
        with self.assertRaises(RuntimeError):
            w.copy_idrive(s3, ["centralis"], "backup/", io.StringIO())
        self.assertEqual(s3.copy.call_args.kwargs["ExtraArgs"]["CopySourceIfMatch"], "version1")
        with self.assertRaises(RuntimeError):
            w.copy_idrive(s3, [w.DESTINATION], "backup/", io.StringIO())

    def test_upload_size_and_digest_check(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "data"
            path.write_bytes(b"private backup")
            s3 = Mock()
            s3.head_object.return_value = {"ContentLength": 14, "Metadata": {"sha256": w.file_hash(path)}}
            s3.get_object.return_value = {"Body": io.BytesIO(b"private backup")}
            result = w.upload_verified(s3, path, "target")
            self.assertEqual(result["bytes"], 14)
            s3.head_object.return_value["ContentLength"] = 1
            with self.assertRaises(RuntimeError):
                w.upload_verified(s3, path, "target")
            s3.head_object.return_value["ContentLength"] = 14
            s3.get_object.return_value = {"Body": io.BytesIO(b"corrupted data")}
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                w.upload_verified(s3, path, "target")


if __name__ == "__main__":
    unittest.main()
