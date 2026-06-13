// End-to-end R2 check: presign -> PUT -> public GET.
// Usage: node scripts/verify-r2.mjs           (defaults to local dev server)
//        ORIGIN=https://social-approvals.vercel.app node scripts/verify-r2.mjs
const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

// A minimal valid 1x1 white JPEG.
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////' +
  '////////////////////////////////////////////////////////////////wgARCAAB' +
  'AAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQBAQAAAAAAAAAAAAAAAAAAAAD/' +
  '2gAMAwEAAhADEAAAAUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAA' +
  'AAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//' +
  'xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oA' +
  'CAEBAAE/IX//2gAMAwEAAgADAAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//' +
  'xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oA' +
  'CAEBAAE/EH//2Q==';
const bytes = Buffer.from(JPEG_B64, 'base64');

const presign = await fetch(`${ORIGIN}/api/uploads/presign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contentType: 'image/jpeg' }),
});
if (!presign.ok) throw new Error(`presign failed: ${presign.status} ${await presign.text()}`);
const { uploadUrl, publicUrl } = await presign.json();
console.log('1/3 presigned OK ->', publicUrl);

const put = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: bytes,
});
if (!put.ok) throw new Error(`PUT to R2 failed: ${put.status} ${await put.text()}`);
console.log('2/3 PUT to R2 OK');

// Public read can lag a moment after write; retry briefly.
let ok = false;
for (let i = 0; i < 10; i++) {
  const get = await fetch(publicUrl);
  const ct = get.headers.get('content-type') || '';
  if (get.ok && ct.includes('image')) {
    console.log(`3/3 public GET OK (content-type: ${ct})`);
    ok = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ok) throw new Error('public GET did not return an image');
console.log('\n✅ R2 round-trip verified:', publicUrl);
