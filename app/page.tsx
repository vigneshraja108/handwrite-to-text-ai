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

// import React, { useState, useRef, useEffect } from 'react';

// type ChatMessage = {
//   role: 'user' | 'assistant';
//   text: string;
// };

// export default function HomePage() {
//   const [selectedFile, setSelectedFile] = useState<File | null>(null);
//   const [previewUrl, setPreviewUrl] = useState<string | null>(null);
//   const [resultText, setResultText] = useState('');
//   const [chatInput, setChatInput] = useState('');
//   const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [chatLoading, setChatLoading] = useState(false);
//   const [error, setError] = useState('');
//   const chatContainerRef = useRef<HTMLDivElement | null>(null);

//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (file) {
//       setSelectedFile(file);
//       setPreviewUrl(URL.createObjectURL(file));
//       setResultText('');
//       setChatInput('');
//       setChatHistory([]);
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
//       if (!res.ok) throw new Error(data.error || 'Unknown error');

//       setResultText(data.text);
//       setSelectedFile(null); // Clear image
//     } catch (err: any) {
//       setError(err.message || 'Something went wrong');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleChat = async () => {
//     if (!chatInput.trim()) return;

//     const userMessage: ChatMessage = { role: 'user', text: chatInput };
//     setChatHistory((prev) => [...prev, userMessage]);
//     setChatInput('');
//     setChatLoading(true);
//     setError('');

//     try {
//       const res = await fetch('/api/chat', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           chat: [...chatHistory, userMessage],
//           extractedText: resultText,
//         }),
//       });

//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Unknown error');

//       const assistantMessage: ChatMessage = { role: 'assistant', text: data.reply };
//       setChatHistory((prev) => [...prev, assistantMessage]);
//     } catch (err: any) {
//       setError(err.message || 'Chat failed');
//     } finally {
//       setChatLoading(false);
//     }
//   };

//   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
//     if (e.key === 'Enter' && !e.shiftKey) {
//       e.preventDefault();
//       handleChat();
//     }
//   };

//   useEffect(() => {
//     if (chatContainerRef.current) {
//       chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
//     }
//   }, [chatHistory]);

//   return (
//     <main className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
//       {/* Upload Panel */}
//       <section className="md:w-1/2 p-6 bg-white border-r border-gray-300">
//         <div className="sticky top-0">
//           <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">📝 Upload Handwritten Image</h1>
//           <form onSubmit={handleSubmit} className="space-y-4">
//             <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-gray-500">
//               <input
//                 type="file"
//                 accept="image/*"
//                 onChange={handleFileChange}
//                 className="hidden"
//               />
//               <span>{selectedFile ? selectedFile.name : 'Click or drop image here'}</span>
//             </label>

//             {previewUrl && selectedFile && (
//               <img
//                 src={previewUrl}
//                 alt="Preview"
//   className="max-w-full max-h-[60vh] object-contain rounded border shadow-sm mx-auto"
//               />
//             )}

//             <button
//               type="submit"
//               disabled={!selectedFile || loading}
//               className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
//             >
//               {loading ? 'Extracting...' : 'Extract Text'}
//             </button>

//             {error && <p className="text-red-600 text-sm text-center">{error}</p>}
//           </form>
//         </div>
//       </section>

//       {/* Result + Chat Panel */}
//       <section className="md:w-1/2 flex flex-col max-h-screen">
//         <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
//           {resultText && (
//             <div className="bg-white p-4 rounded shadow border">
//               <h2 className="font-semibold mb-2 text-gray-800">📜 Extracted Text:</h2>
//               {previewUrl && (
//                 <img
//                   src={previewUrl}
//                   alt="Extracted"
//                   className="mt-4 w-24 rounded border shadow-sm"
//                 />
//               )}
//               <p className="whitespace-pre-wrap text-gray-700 text-sm mt-2">{resultText}</p>
//             </div>
//           )}

//           {chatHistory.length > 0 && (
//             <div className="flex flex-col gap-2 mt-4">
//               {chatHistory.map((msg, index) => (
//                 <div
//                   key={index}
//                   className={`p-3 rounded-lg shadow border text-sm whitespace-pre-wrap ${
//                     msg.role === 'user'
//                       ? 'bg-blue-100 text-left text-gray-800 self-start'
//                       : 'bg-green-100 text-left text-gray-800 self-end'
//                   }`}
//                 >
//                   <strong>{msg.role === 'user' ? 'You' : 'Gemini'}:</strong> {msg.text}
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Chat Input */}
//         {resultText && (
//           <div className="sticky bottom-0 p-4 bg-white border-t shadow">
//             <h2 className="font-semibold mb-2 text-gray-800">💬 Ask a question</h2>
//             <textarea
//               value={chatInput}
//               onChange={(e) => setChatInput(e.target.value)}
//               onKeyDown={handleKeyDown}
//               rows={3}
//               className="w-full border rounded p-2 mb-2 text-sm"
//               placeholder="Ask a question about the extracted text..."
//             />
//             <button
//               onClick={handleChat}
//               disabled={chatLoading}
//               className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
//             >
//               {chatLoading ? 'Thinking...' : 'Ask'}
//             </button>
//           </div>
//         )}
//       </section>
//     </main>
//   );
// }







"use client";
import React, { useState, useEffect, useRef } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type Session = {
  id: string;
  imageUrl: string;
  extractedText: string;
  chatHistory: ChatMessage[];
};

export default function Page() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sessionRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (!activeSessionId) return;
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (!activeSession) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const res = await fetch("/api/gemini", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const newSession: Session = {
        id: crypto.randomUUID(),
        imageUrl: previewUrl || "",
        extractedText: data.text,
        chatHistory: [],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(newSession.id);
      setSelectedFile(null);
      setPreviewUrl(null);
      setChatInput("");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleChat() {
    if (!chatInput.trim() || !activeSessionId) return;
    setChatLoading(true);
    setError("");

    const input = chatInput.trim();

    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              chatHistory: [
                ...session.chatHistory,
                { role: "user", text: input },
              ],
            }
          : session
      )
    );

    setChatInput("");

    try {
      const activeSession = sessions.find((s) => s.id === activeSessionId);
      if (!activeSession) throw new Error("Session not found");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat: [...activeSession.chatHistory, { role: "user", text: input }],
          extractedText: activeSession.extractedText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");

      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                chatHistory: [
                  ...session.chatHistory,
                  { role: "assistant", text: data.reply },
                ],
              }
            : session
        )
      );
    } catch (err: any) {
      setError(err.message || "Chat failed");
    } finally {
      setChatLoading(false);
    }
  }

  const handleSessionSelect = (id: string) => {
    setActiveSessionId(id);
    setTimeout(() => {
      sessionRefs.current[id]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100); // Delay to ensure render
  };

  return (
    <main className="flex flex-col md:flex-row min-h-screen overflow-hidden">
      {/* Upload Section */}
      <section className="w-full md:w-1/2 p-6 bg-white border-b md:border-b-0 md:border-r border-gray-300 overflow-hidden">
        <div className="sticky top-0">
          <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
            📝 Upload Handwritten Image
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-gray-500">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span>
                {selectedFile ? selectedFile.name : "Click or drop image here"}
              </span>
            </label>

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-[60vh] object-contain rounded border shadow-sm mx-auto"
              />
            )}

            <button
              type="submit"
              disabled={!selectedFile || loading}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
            >
              {loading ? "Extracting..." : "Extract Text"}
            </button>

            {error && (
              <p className="text-red-600 text-sm text-center">{error}</p>
            )}
          </form>
        </div>
      </section>

      {/* Chat Section */}
      <section className="w-full md:w-1/2 flex flex-col p-6 bg-gray-50 h-screen">
        {/* Sessions and extracted text list */}
        <div
          className="flex-1 overflow-y-auto pr-2 space-y-6"
          style={{ maxHeight: "calc(100vh - 150px)" }}
        >
          {sessions.length === 0 && (
            <p className="text-gray-600 text-center mt-20">
              Upload an image to start chatting.
            </p>
          )}

          {sessions.map((session) => (
            <div
              key={session.id}
              ref={(el) => {
                sessionRefs.current[session.id] = el;
              }}
              onClick={() => handleSessionSelect(session.id)}
              className={`p-4 rounded border cursor-pointer transition-all flex flex-col ${
                session.id === activeSessionId
                  ? "border-blue-600 bg-white shadow"
                  : "border-gray-300 bg-gray-100"
              }`}
            >
              <h2 className="font-semibold mb-2 text-gray-800 flex items-center gap-2">
                📜 Extracted Text
                {session.id === activeSessionId && (
                  <span className="text-sm text-blue-600">(Active)</span>
                )}
              </h2>

              {session.imageUrl && (
                <img
                  src={session.imageUrl}
                  alt="Uploaded"
                  className="w-24 rounded border shadow-sm mb-2 object-contain"
                />
              )}

              <pre className="whitespace-pre-wrap text-gray-700 text-sm mb-4 max-h-32 overflow-auto">
                {session.extractedText}
              </pre>

              {/* Chat Messages */}
              {session.id === activeSessionId && (
                <div
                  className="flex flex-col overflow-y-auto pr-1 scroll-smooth"
                  style={{ maxHeight: "25vh" }}
                >
                  <div className="flex flex-col gap-2">
                    {session.chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded-lg text-sm max-w-[80%] ${
                          msg.role === "user"
                            ? "bg-blue-100 self-start text-gray-800"
                            : "bg-green-100 self-end text-gray-800"
                        }`}
                      >
                        <strong>{msg.role === "user" ? "You" : "Gemini"}:</strong>{" "}
                        {msg.text}
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Chat Input */}
        {activeSessionId && (
          <div className="mt-4 p-4 bg-white border-t shadow">
            <h2 className="font-semibold mb-2 text-gray-800">💬 Ask a question</h2>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!chatLoading) handleChat();
                }
              }}
              rows={3}
              className="w-full border rounded p-2 mb-2 text-sm resize-none"
              placeholder="Ask a question about the extracted text..."
              disabled={chatLoading}
            />
            <button
              onClick={handleChat}
              disabled={chatLoading || !chatInput.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
            >
              {chatLoading ? "Thinking..." : "Ask"}
            </button>
            {error && <p className="text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
