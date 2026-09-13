#!/bin/sh
set -eu

: "${RUSTFS_S3_ENDPOINT:?RUSTFS_S3_ENDPOINT is required}"
: "${RUSTFS_S3_BUCKET:?RUSTFS_S3_BUCKET is required}"

# RustFS CI and local development both use path-style S3 requests, matching the app configuration.
cat > /tmp/aws-config <<'EOF'
[default]
s3 =
    addressing_style = path
EOF
export AWS_CONFIG_FILE=/tmp/aws-config

until aws --endpoint-url "$RUSTFS_S3_ENDPOINT" s3api list-buckets >/dev/null 2>&1; do
  sleep 2
done

if ! aws --endpoint-url "$RUSTFS_S3_ENDPOINT" s3api head-bucket \
  --bucket "$RUSTFS_S3_BUCKET" >/dev/null 2>&1; then
  aws --endpoint-url "$RUSTFS_S3_ENDPOINT" s3api create-bucket \
    --bucket "$RUSTFS_S3_BUCKET"
fi

cat > /tmp/rustfs-read-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::${RUSTFS_S3_BUCKET}/*"]
    }
  ]
}
EOF

aws --endpoint-url "$RUSTFS_S3_ENDPOINT" s3api put-bucket-policy \
  --bucket "$RUSTFS_S3_BUCKET" \
  --policy file:///tmp/rustfs-read-policy.json

echo "RustFS bucket ready: $RUSTFS_S3_BUCKET"
