import { supabase } from './supabase'

/**
 * Uploads a picked photo to the `problem-images` bucket and returns its public
 * URL, or null when the upload failed — callers decide whether that's fatal.
 *
 * The path is namespaced by user id on purpose: the bucket's policies and
 * `delete_my_account`'s storage sweep (migration 088) both key off the first
 * folder segment, so an object stored anywhere else outlives its owner.
 */
export async function uploadProblemImage(file: File, userId: string): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('problem-images').upload(path, file, { upsert: true })
  if (error) return null
  return supabase.storage.from('problem-images').getPublicUrl(path).data.publicUrl
}
