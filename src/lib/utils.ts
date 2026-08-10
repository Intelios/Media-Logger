import {
  cancelCoverImport,
  commitCoverImport,
  initializeImageService,
  stageCoverImport,
} from './image-service';

/**
 * Compatibility helper for profile-image callers. Image bytes never enter
 * JavaScript: the native service stages, validates, atomically commits, and
 * prepares display derivatives before returning the relative database path.
 */
export async function saveImage(sourcePath: string): Promise<string | null> {
  if (!sourcePath) return null;

  let token: string | null = null;
  try {
    await initializeImageService();
    const staged = await stageCoverImport(sourcePath);
    token = staged.token;
    const committed = await commitCoverImport(staged.token);
    token = null;
    return committed.imagePath;
  } catch (error) {
    if (token) {
      await cancelCoverImport(token).catch(() => {
        // A failed commit may already have consumed/restored the stage. The
        // original error is the useful one to report.
      });
    }
    console.error('Failed to import image:', error);
    return null;
  }
}
