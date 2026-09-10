/**
 * Powers "Add to Home Screen" - without this, saving the board to a phone's
 * home screen just bookmarks the current URL under a browser icon. With it,
 * the saved icon is the Khaadi Tracker logo (see app/icon.png and
 * app/apple-icon.png) and it opens full-screen, standalone, the way a real
 * app does rather than inside browser chrome.
 */
export default function manifest() {
  return {
    name: 'Khaadi Production Board',
    short_name: 'Khaadi Tracker',
    description: 'Khaadi x ImagineArt PDP shoot - every batch, tracked live.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
