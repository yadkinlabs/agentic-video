import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireChannelRole } from "@/lib/auth";
import { resolveServiceConfig } from "@/lib/config";

type Params = { params: Promise<{ channelId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "viewer");

    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    const [accountId, accessKey, secretKey, bucket] = await Promise.all([
      resolveServiceConfig(id, "r2_account_id"),
      resolveServiceConfig(id, "r2_access_key"),
      resolveServiceConfig(id, "r2_secret_key"),
      resolveServiceConfig(id, "r2_bucket"),
    ]);

    if (!accountId || !accessKey || !secretKey || !bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 422 });
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({ url });
  } catch (res) {
    return res as NextResponse;
  }
}
