'use client';

import { useState } from 'react';
import { uploadImage } from '@/lib/upload';

export default function UploadTest() {
  const [status, setStatus] = useState<string>('Pick an image to upload.');
  const [url, setUrl] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Cropping + uploading…');
    setUrl(null);
    try {
      const { publicUrl, assessment } = await uploadImage(file);
      setStatus(`Done (${assessment}).`);
      setUrl(publicUrl);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Upload test (temporary)</h1>
      <input type="file" accept="image/*" onChange={onChange} />
      <p>{status}</p>
      {url && (
        <>
          <p>
            Public URL: <a href={url}>{url}</a>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="uploaded" style={{ width: 216, height: 270, objectFit: 'cover' }} />
        </>
      )}
    </main>
  );
}
