import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { logger } from "../utils/logger";

const s3Endpoint = process.env.S3_ENDPOINT?.trim() || "http://localhost:9000";
const s3PublicUrl = process.env.S3_PUBLIC_URL?.trim() || "http://localhost:9000";
const s3Region = process.env.S3_REGION?.trim() || "us-east-1";
const s3Bucket = process.env.S3_BUCKET?.trim() || "scan2serve-menu-images";
const s3AccessKey = process.env.S3_ACCESS_KEY?.trim() || "minioadmin";
const s3SecretKey = process.env.S3_SECRET_KEY?.trim() || "minioadmin";
const s3ForcePathStyle = (process.env.S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false";

let bucketReadyPromise: Promise<void> | null = null;

const s3Client = new S3Client({
  endpoint: s3Endpoint,
  region: s3Region,
  forcePathStyle: s3ForcePathStyle,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
  },
});

const toPublicImageUrl = (objectPath: string) => {
  const normalizedPublic = s3PublicUrl.replace(/\/$/, "");
  const normalizedBucket = encodeURIComponent(s3Bucket);
  const path = objectPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${normalizedPublic}/${normalizedBucket}/${path}`;
};

const getPublicReadPolicy = () =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowPublicRead",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${s3Bucket}/*`],
      },
    ],
  });

const ensureBucketReady = async () => {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
      } catch {
        await s3Client.send(new CreateBucketCommand({ Bucket: s3Bucket }));
        logger.info("storage.bucket.created", { bucket: s3Bucket });
      }

      try {
        await s3Client.send(
          new PutBucketPolicyCommand({
            Bucket: s3Bucket,
            Policy: getPublicReadPolicy(),
          })
        );
      } catch (error) {
        logger.warn("storage.bucket.policy.failed", {
          bucket: s3Bucket,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }

  return bucketReadyPromise;
};

export const uploadImageObject = async ({
  objectPath,
  body,
  contentType,
}: {
  objectPath: string;
  body: Buffer;
  contentType: string;
}) => {
  await ensureBucketReady();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: objectPath,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    })
  );

  return {
    imagePath: objectPath,
    imageUrl: toPublicImageUrl(objectPath),
  };
};

export const resolveImageUrl = (imagePath: string | null) =>
  imagePath ? toPublicImageUrl(imagePath) : null;

export const extractImagePathFromUrl = (imageUrl: string | null) => {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl);
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (segments.length < 2) return null;
    if (segments[0] !== s3Bucket) return null;
    return segments.slice(1).join("/");
  } catch {
    return null;
  }
};

export const deleteImageObject = async (objectPath: string) => {
  await ensureBucketReady();
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: objectPath,
    })
  );
};
