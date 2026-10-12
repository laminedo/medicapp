// Where the server lives.
//
// Empty means "the same address these pages came from", which is how it works
// when the Node server serves the pages itself (your own machine, or a host).
// On GitHub Pages there is no server behind the pages, so they call the
// Supabase function instead. If you move to your own domain, change the test.
window.MEDICAPP = {
  apiBase: location.hostname.endsWith('.github.io') ? 'https://aghnfdzewevmbznfmxja.supabase.co/functions/v1' : '',
};
