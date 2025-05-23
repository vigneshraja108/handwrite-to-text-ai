// 'use client';

// import React, { useState } from 'react';

// export default function HomePage() {
//   const [selectedFile, setSelectedFile] = useState<File | null>(null);
//   const [previewUrl, setPreviewUrl] = useState<string | null>(null);
//   const [resultText, setResultText] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');

//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (file) {
//       setSelectedFile(file);
//       setPreviewUrl(URL.createObjectURL(file));
//       setResultText('');
//       setError('');
//     }
//   };

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!selectedFile) return;

//     setLoading(true);
//     setResultText('');
//     setError('');

//     const formData = new FormData();
//     formData.append('image', selectedFile);

//     try {
//       const res = await fetch('/api/gemini', {
//         method: 'POST',
//         body: formData,
//       });

//       const data = await res.json();

//       if (!res.ok) {
//         throw new Error(data.error || 'Unknown error');
//       }

//       setResultText(data.text);
//     } catch (err: any) {
//       setError(err.message || 'Something went wrong');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <main className="flex flex-col items-center justify-center p-4 min-h-screen bg-gray-50">
//       <h1 className="text-2xl font-bold mb-6">Handwritten Image to Text (Gemini)</h1>

//       <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
//         <input
//           type="file"
//           accept="image/*"
//           onChange={handleFileChange}
//           className="block w-full border border-gray-300 p-2 rounded"
//         />

//         {previewUrl && (
//           <div className="mt-2">
//             <p className="text-sm text-gray-600">Preview:</p>
//             <img src={previewUrl} alt="Preview" className="w-full rounded shadow" />
//           </div>
//         )}

//         <button
//           type="submit"
//           disabled={!selectedFile || loading}
//           className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
//         >
//           {loading ? 'Extracting...' : 'Extract Text'}
//         </button>
//       </form>

//       {resultText && (
//         <div className="mt-6 p-4 bg-green-100 border border-green-400 rounded w-full max-w-md">
//           <h2 className="font-bold mb-2">Extracted Text:</h2>
//           <p className="whitespace-pre-wrap">{resultText}</p>
//         </div>
//       )}

//       {error && (
//         <div className="mt-6 p-4 bg-red-100 border border-red-400 rounded w-full max-w-md text-red-700">
//           <p>Error: {error}</p>
//         </div>
//       )}
//     </main>
//   );
// }



'use client';

import React, { useState } from 'react';

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResultText('');
      setChatInput('');
      setChatResponse('');
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setResultText('');
    setError('');

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setResultText(data.text);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;

    setChatLoading(true);
    setChatResponse('');
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          chat: [{ role: 'user', text: chatInput }],
          extractedText: resultText,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setChatResponse(data.reply);
    } catch (err: any) {
      setError(err.message || 'Chat failed');
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Upload Panel */}
      <section className="md:w-1/2 p-6 bg-white border-r border-gray-300">
        <div className="sticky top-0">
          <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">📝 Upload Handwritten Image</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-gray-500">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <span>{selectedFile ? selectedFile.name : 'Click or drop image here'}</span>
            </label>

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-auto rounded border shadow-sm"
              />
            )}

            <button
              type="submit"
              disabled={!selectedFile || loading}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
            >
              {loading ? 'Extracting...' : 'Extract Text'}
            </button>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          </form>
        </div>
      </section>

      {/* Result + Chat Panel */}
      <section className="md:w-1/2 p-6 flex flex-col bg-gray-50 overflow-y-auto max-h-screen">
        {resultText && (
          <>
            {/* Extracted Text */}
            <div className="bg-white p-4 rounded shadow border mb-4">
              <h2 className="font-semibold mb-2 text-gray-800">📜 Extracted Text:</h2>
              <p className="whitespace-pre-wrap text-gray-700 text-sm">{resultText}</p>
            </div>

            {/* Chat Response */}
            {chatResponse && (
              <div className="bg-white p-4 rounded shadow border mb-4">
                <h3 className="font-semibold text-gray-800 mb-2">🧠 Gemini Assistant:</h3>
                <p className="text-gray-700 whitespace-pre-wrap text-sm">{chatResponse}</p>
              </div>
            )}
          </>
        )}

        {/* Ask a Question */}
        {resultText && (
          <div className="bg-white p-4 rounded shadow border mt-auto">
            <h2 className="font-semibold mb-2 text-gray-800">💬 Ask a question</h2>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full border rounded p-2 mb-2 text-sm"
              placeholder="Ask a question about the extracted text..."
            />
            <button
              onClick={handleChat}
              disabled={chatLoading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
            >
              {chatLoading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}



