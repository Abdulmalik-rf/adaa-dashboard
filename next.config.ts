import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the content-submission form push images/video through the
  // server action without hitting the default 1MB cap.
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // COEP was previously set to `require-corp` which blocked any cross-origin
  // <img>/<video> that didn't explicitly opt-in via CORP — including every
  // file in the `content-uploads` Supabase Storage bucket. The kanban
  // rendered the "media" chip but the preview was a broken image because of
  // this header. We don't depend on crossOriginIsolated features
  // (SharedArrayBuffer, performance.measureUserAgentSpecificMemory…), so
  // dropping COEP is the cleanest fix. COOP is dropped too since it only
  // gains meaning alongside COEP.
  async headers() {
    return []
  },
};

export default nextConfig;
