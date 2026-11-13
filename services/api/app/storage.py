"""Private S3 storage (Selectel, S3 API). Metadata lives in the DB; large files only here."""
from __future__ import annotations
import hashlib
from dataclasses import dataclass
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from .secrets import get_secret

STRUCTURE = ["personal", "projects", "meetings", "recordings", "transcripts", "reports",
             "documents", "attachments", "knowledge", "exports", "backups"]


@dataclass
class S3Config:
    endpoint: str
    region: str
    bucket: str


def client(cfg: S3Config):
    ak, sk = get_secret("s3_access_key"), get_secret("s3_secret_key")
    if not (ak and sk):
        raise RuntimeError("S3 keys are not set in Credential Manager")
    return boto3.client(
        "s3", endpoint_url=cfg.endpoint, region_name=cfg.region, aws_access_key_id=ak, aws_secret_access_key=sk,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 3, "mode": "standard"},
                      connect_timeout=8, read_timeout=30),
    )


def ensure_private_bucket(cfg: S3Config) -> str:
    """Create the bucket if missing and force it private. Returns 'created' | 'exists'."""
    c = client(cfg)
    state = "exists"
    try:
        c.head_bucket(Bucket=cfg.bucket)
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("404", "NoSuchBucket", "NotFound"):
            raise
        c.create_bucket(Bucket=cfg.bucket, ACL="private")
        state = "created"
    assert_private(cfg)
    return state


def assert_private(cfg: S3Config) -> None:
    """Fail if anyone other than the owner has a grant (public/authenticated groups)."""
    grants = client(cfg).get_bucket_acl(Bucket=cfg.bucket)["Grants"]
    bad = [g for g in grants if g["Grantee"].get("Type") == "Group"]
    if bad:
        raise RuntimeError(f"Bucket {cfg.bucket} is not private: {bad}")


def init_structure(cfg: S3Config) -> None:
    c = client(cfg)
    for p in STRUCTURE:
        c.put_object(Bucket=cfg.bucket, Key=f"{p}/", Body=b"")


def put_file(cfg: S3Config, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload with SHA-256 integrity check. Returns hex digest."""
    digest = hashlib.sha256(data).hexdigest()
    client(cfg).put_object(Bucket=cfg.bucket, Key=key, Body=data, ContentType=content_type, Metadata={"sha256": digest})
    return digest


def get_file(cfg: S3Config, key: str) -> bytes:
    r = client(cfg).get_object(Bucket=cfg.bucket, Key=key)
    data = r["Body"].read()
    expected = r.get("Metadata", {}).get("sha256")
    if expected and hashlib.sha256(data).hexdigest() != expected:
        raise IOError(f"Integrity check failed for {key}")
    return data


def presign(cfg: S3Config, key: str, seconds: int = 300) -> str:
    return client(cfg).generate_presigned_url("get_object", Params={"Bucket": cfg.bucket, "Key": key}, ExpiresIn=seconds)


def usage(cfg: S3Config) -> dict:
    """Bytes and object count per top-level folder (folder markers excluded)."""
    by: dict[str, dict] = {}
    total = count = 0
    for page in client(cfg).get_paginator("list_objects_v2").paginate(Bucket=cfg.bucket):
        for o in page.get("Contents", []):
            if o["Key"].endswith("/") and o["Size"] == 0:
                continue
            top = o["Key"].split("/", 1)[0]
            d = by.setdefault(top, {"size": 0, "count": 0})
            d["size"] += o["Size"]
            d["count"] += 1
            total += o["Size"]
            count += 1
    return {"total": total, "count": count, "folders": by}


def health(cfg: S3Config) -> dict:
    try:
        client(cfg).head_bucket(Bucket=cfg.bucket)
        return {"ok": True, "bucket": cfg.bucket}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": type(e).__name__}
