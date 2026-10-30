import 'server-only'

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AppError } from '@/lib/errors'
import { assertSafeObjectKey } from '@/lib/keys'
import type { ObjectSigner } from '@/lib/presign'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new AppError(500, 'config', `Servervariable ${name} fehlt.`)
  return value
}

let client: S3Client | undefined

export function resetR2ClientForTests(): void {
  client = undefined
}

export function getR2Client(): S3Client {
  if (!client) {
    const accountId = required('R2_ACCOUNT_ID')
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    })
  }
  return client
}

function bucket(): string {
  return required('R2_BUCKET_NAME')
}

export function createLazyR2Signer(): ObjectSigner {
  let signer: ObjectSigner | null = null
  const get = () => (signer ??= createR2Signer())
  return {
    signPut: (input) => get().signPut(input),
    signGet: (input) => get().signGet(input),
  }
}

export function createR2Signer(): ObjectSigner {
  const s3 = getR2Client()
  const Bucket = bucket()
  return {
    async signPut({ key, contentType, expiresIn }) {
      assertSafeObjectKey(key)
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
      })
      return getSignedUrl(s3, command, { expiresIn })
    },
    async signGet({ key, expiresIn }) {
      assertSafeObjectKey(key)
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
      })
      return getSignedUrl(s3, command, { expiresIn })
    },
  }
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  const metadata = '$metadata' in error ? error.$metadata : undefined
  const status =
    metadata && typeof metadata === 'object' && 'httpStatusCode' in metadata
      ? Number(metadata.httpStatusCode)
      : 0
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404
}

export async function headR2Object(key: string): Promise<{ byteSize: number; contentType?: string }> {
  assertSafeObjectKey(key)
  try {
    const result = await getR2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { byteSize: result.ContentLength ?? 0, contentType: result.ContentType }
  } catch (error) {
    if (isMissingObject(error)) {
      throw new AppError(400, 'incomplete', 'Die Datei ist nicht im Speicher angekommen.')
    }
    throw error
  }
}

export async function deleteR2Objects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))]
  for (const key of unique) assertSafeObjectKey(key)
  for (let index = 0; index < unique.length; index += 1000) {
    const chunk = unique.slice(index, index + 1000)
    await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    )
  }
}
