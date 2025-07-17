import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function uploadFile(name: string, content: Buffer) {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: name,
      Body: content,
      ChecksumAlgorithm: "SHA256",
    }),
  );
}

export async function presignUrl(name: string, expiresIn: number) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: name,
  });

  return await getSignedUrl(s3, command, { expiresIn });
}

export async function getHash(name: string) {
  const command = new HeadObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: name,
  });

  const response = await s3.send(command);
  return Uint8Array.fromBase64(response.ChecksumSHA256!);
}
