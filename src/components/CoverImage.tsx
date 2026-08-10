import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from 'react';
import defaultCoverImage from '../assets/cover-fallback.svg';
import {
  createMediaSources,
  initializeImageService,
  useImageServiceStatus,
  type CoverVariant,
} from '../lib/image-service';
import { cn } from '../lib/utils_ui';
import { recordPerformanceSample } from '../lib/performance-diagnostics';

export type CoverPriority = 'high' | 'auto' | 'low';

// `className` is omitted deliberately: this renders a wrapper *and* an image, so
// a single class list is ambiguous and the component would silently drop it.
// Use containerClassName / imageClassName instead — the compiler now says so.
export interface CoverImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes' | 'loading' | 'decoding' | 'className'> {
  path: string | null | undefined;
  variant?: CoverVariant;
  priority?: CoverPriority;
  sizes?: string;
  fallbackSrc?: string;
  containerClassName?: string;
  containerStyle?: CSSProperties;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  showSkeleton?: boolean;
  skeletonDelayMs?: number;
}

export const CoverImage = forwardRef<HTMLImageElement, CoverImageProps>(function CoverImage(
  {
    path,
    variant = 'card',
    priority = 'auto',
    sizes,
    fallbackSrc = defaultCoverImage,
    containerClassName,
    containerStyle,
    imageClassName,
    imageStyle,
    showSkeleton = true,
    skeletonDelayMs = 100,
    alt = '',
    onLoad,
    onError,
    ...imageProps
  },
  forwardedRef,
) {
  const service = useImageServiceStatus();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [decoded, setDecoded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showDelayedSkeleton, setShowDelayedSkeleton] = useState(false);
  const remote = Boolean(path && /^https?:\/\//iu.test(path));
  const loadStartedAtRef = useRef(performance.now());
  const reportedSourceRef = useRef('');

  useImperativeHandle(forwardedRef, () => imageRef.current as HTMLImageElement, []);

  useEffect(() => {
    if (!path || remote || service?.configured) return;
    void initializeImageService().catch((error) => {
      console.error('[Image Service] Initialization failed:', error);
      setFailed(true);
    });
  }, [path, remote, service?.configured]);

  const sources = useMemo(
    () => createMediaSources(path, variant),
    [path, service?.protocolBase, service?.generation, variant],
  );
  const selectedSrc = failed || !path ? fallbackSrc : sources.src;

  useEffect(() => {
    loadStartedAtRef.current = performance.now();
    reportedSourceRef.current = '';
    setDecoded(false);
    setFailed(false);
    setShowDelayedSkeleton(false);
    if (!path) {
      setDecoded(true);
      return;
    }
    const timer = window.setTimeout(() => setShowDelayedSkeleton(true), skeletonDelayMs);
    return () => window.clearTimeout(timer);
  }, [path, selectedSrc, skeletonDelayMs]);

  const reveal = useCallback(async (image: HTMLImageElement) => {
    const decodeStartedAt = performance.now();
    try {
      if (typeof image.decode === 'function') await image.decode();
    } catch {
      // A completed image can reject decode() in older WKWebView builds. The
      // natural dimensions below remain the reliable success signal.
    }
    if (image.naturalWidth > 0) {
      setDecoded(true);
      if (reportedSourceRef.current !== image.currentSrc) {
        reportedSourceRef.current = image.currentSrc;
        const decodedAt = performance.now();
        recordPerformanceSample('image', `decode:${variant}`, decodedAt - decodeStartedAt, {
          remote,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        requestAnimationFrame(() => {
          recordPerformanceSample('image', `visible-paint:${variant}`, performance.now() - loadStartedAtRef.current, {
            remote,
          });
        });
      }
      return;
    }
    // Some WebKit builds fire `load` before dimensions are decoded when the
    // renderer is under pressure. Give the browser one extra frame to publish
    // naturalWidth before leaving the skeleton up forever.
    requestAnimationFrame(() => {
      if (image.naturalWidth > 0) {
        setDecoded(true);
      }
    });
  }, [remote, variant]);

  const attachImage = useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    if (node?.complete && node.naturalWidth > 0) void reveal(node);
  }, [reveal]);

  const handleLoad: NonNullable<ImgHTMLAttributes<HTMLImageElement>['onLoad']> = (event) => {
    recordPerformanceSample('image', `load:${variant}`, performance.now() - loadStartedAtRef.current, {
      remote,
    });
    void reveal(event.currentTarget);
    onLoad?.(event);
  };

  const handleError: NonNullable<ImgHTMLAttributes<HTMLImageElement>['onError']> = (event) => {
    if (!failed) setFailed(true);
    else setDecoded(true);
    onError?.(event);
  };

  const waitingForService = Boolean(path && !remote && !service?.configured && !failed);
  const showLoading = showSkeleton && showDelayedSkeleton && (!decoded || waitingForService);

  return (
    <span
      // `isolate` keeps the skeleton/image z-indexes below scoped to this
      // wrapper. Without it the image's z-[1] competes in the *caller's*
      // stacking context and paints over sibling overlays (badges, gradients)
      // that are rendered after the cover and expect to sit on top of it.
      className={cn('relative isolate block overflow-hidden', containerClassName)}
      style={containerStyle}
      data-cover-variant={variant}
    >
      {showLoading && <span className="cover-skeleton absolute inset-0 z-0" aria-hidden="true" />}
      {selectedSrc && (
        <img
          {...imageProps}
          ref={attachImage}
          src={selectedSrc}
          srcSet={!failed ? sources.srcSet : undefined}
          sizes={sizes ?? sources.sizes}
          alt={alt}
          loading={priority === 'high' ? 'eager' : 'lazy'}
          fetchPriority={priority}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'relative z-[1] transition-opacity duration-[120ms]',
            decoded ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
          style={imageStyle}
        />
      )}
    </span>
  );
});

export default CoverImage;
