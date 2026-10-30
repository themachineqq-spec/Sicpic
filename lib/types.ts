export type MemberRole = 'admin' | 'member'

export type Member = {
  id: string
  userId: string | null
  email: string
  displayName: string
  role: MemberRole
}

export type FeedbackKind = 'bug' | 'feature'
export type FeedbackStatus = 'neu' | 'in_arbeit' | 'erledigt'

export type FeedbackItem = {
  id: string
  authorId: string
  authorName: string
  kind: FeedbackKind
  title: string
  body: string
  status: FeedbackStatus
  hasScreenshot: boolean
  createdAt: string
  updatedAt: string
}
export type PhotoVariant = 'original' | 'display' | 'thumb'
export type PhotoScope = 'group' | 'mine'

export type GalleryPhoto = {
  id: string
  ownerId: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  capturedAt: string
  createdAt: string
  uploaderName: string
  thumbUrl: string
}

export type PhotoRecord = {
  id: string
  ownerId: string
  originalKey: string
  displayKey: string
  thumbKey: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  capturedAt: string
  createdAt: string
  uploaderName: string
}

export type SessionIdentity = {
  userId: string
}

export type MemberRow = {
  id: string
  user_id: string | null
  email: string
  display_name: string | null
  role: string
}
