// Static export: the site is plain files, so it runs on GitHub Pages, Netlify or Vercel.
// NEXT_PUBLIC_BASE_PATH is set by the GitHub Pages workflow when the site lives at
// https://<user>.github.io/<repo>. Leave it empty for a custom domain, Netlify or Vercel.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
  trailingSlash: true, // every page is a folder with index.html, which GitHub Pages serves reliably
};
export default nextConfig;
