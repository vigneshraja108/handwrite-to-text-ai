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
  const [emailLoading, setEmailLoading] = useState<string | null>(null); // for per-session email spinner
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [emailInputs, setEmailInputs] = useState<{ [id: string]: string }>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sessionRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const chatContainerRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (!activeSessionId) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!selectedFile) return setPreviewUrl(null);
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
      const res = await fetch("/api/gemini", { method: "POST", body: formData });
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

      setTimeout(() => {
        sessionRefs.current[newSession.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
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
          ? { ...session, chatHistory: [...session.chatHistory, { role: "user", text: input }] }
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
                chatHistory: [...session.chatHistory, { role: "assistant", text: data.reply }],
              }
            : session
        )
      );
      setTimeout(() => {
        const chatBox = chatContainerRefs.current[activeSessionId];
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
      }, 100);
    } catch (err: any) {
      setError(err.message || "Chat failed");
    } finally {
      setChatLoading(false);
    }
  }

  const handleSessionSelect = (id: string) => {
    setActiveSessionId(id);
    setTimeout(() => {
      sessionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  async function handleSendEmail(sessionId: string) {
    const email = emailInputs[sessionId]?.trim();
    if (!email) return alert("Enter a valid email.");
    setEmailLoading(sessionId);
    setError("");

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "Extracted Text from Handwritten Image",
          message: session.extractedText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      alert("Email sent!");
      setEmailInputs((prev) => ({ ...prev, [sessionId]: "" }));
    } catch (err: any) {
      alert(err.message || "Failed to send email");
    } finally {
      setEmailLoading(null);
    }
  }

  return (
    <main className="flex flex-col md:flex-row min-h-screen overflow-hidden">
      {/* Upload Section */}
      <section className="w-full md:w-1/2 p-6 bg-white border-b md:border-b-0 md:border-r border-gray-300 overflow-hidden">
        <div className="sticky top-0">
          <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">📝 Upload Handwritten Image</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-gray-500">
              <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
              <span>{selectedFile ? selectedFile.name : "Click or drop image here"}</span>
            </label>

            {previewUrl && (
              <img src={previewUrl} alt="Preview" className="max-w-full max-h-[60vh] object-contain rounded border shadow-sm mx-auto" />
            )}

            <button
              type="submit"
              disabled={!selectedFile || loading}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 transition"
            >
              {loading ? "Extracting..." : "Extract Text"}
            </button>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          </form>
        </div>
      </section>

      {/* Chat Section */}
      <section className="w-full md:w-1/2 flex flex-col p-6 bg-gray-50 h-screen">
        <div className="flex-1 overflow-y-auto pr-2 space-y-6" style={{ maxHeight: "calc(100vh - 150px)" }}>
          {sessions.length === 0 && (
            <p className="text-gray-600 text-center mt-20">Upload an image to start chatting.</p>
          )}

          {sessions.map((session) => (
            <div
              key={session.id}
ref={(el) => {
  sessionRefs.current[session.id] = el;
}}
              onClick={() => handleSessionSelect(session.id)}
              className={`p-4 rounded border cursor-pointer transition-all flex flex-col ${
                session.id === activeSessionId ? "border-blue-600 bg-white shadow" : "border-gray-300 bg-gray-100"
              }`}
            >
              <h2 className="font-semibold mb-2 text-gray-800 flex items-center gap-2">
                📜 Extracted Text {session.id === activeSessionId && <span className="text-sm text-blue-600">(Active)</span>}
              </h2>

              {session.imageUrl && (
                <img src={session.imageUrl} alt="Uploaded" className="w-24 rounded border shadow-sm mb-2 object-contain" />
              )}

              <pre className="whitespace-pre-wrap text-gray-700 text-sm mb-4 max-h-32 overflow-auto">
                {session.extractedText}
              </pre>

              {/* Chat History */}
              {session.id === activeSessionId && (
                <div
ref={(el) => {
  chatContainerRefs.current[session.id] = el;
}}
                  className="flex flex-col overflow-y-auto pr-1 scroll-smooth"
                  style={{ maxHeight: "25vh" }}
                >
                  <div className="flex flex-col gap-2">
                    {session.chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded-lg text-sm max-w-[80%] ${
                          msg.role === "user" ? "bg-blue-100 self-start" : "bg-green-100 self-end"
                        }`}
                      >
                        <strong>{msg.role === "user" ? "You" : "Gemini"}:</strong> {msg.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Send Form */}
              <div className="mt-4 space-y-2">
                <input
                  type="email"
                  placeholder="Enter recipient email"
                  value={emailInputs[session.id] || ""}
                  onChange={(e) =>
                    setEmailInputs((prev) => ({
                      ...prev,
                      [session.id]: e.target.value,
                    }))
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                <button
                  onClick={() => handleSendEmail(session.id)}
                  disabled={!!emailLoading}
                  className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 text-sm"
                >
                  {emailLoading === session.id ? "Sending..." : "Send via Email"}
                </button>
              </div>
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
