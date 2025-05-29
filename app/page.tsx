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
  const [extractedEmail, setExtractedEmail] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sessionRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const chatContainerRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const DEFAULT_EMAIL = "vigneshrajaprofessional@gmail.com";

  function extractEmail(text: string) {
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = match ? match[0] : null;
    setExtractedEmail(email);
    return email;
  }

  function detectEmailToSend(input: string): string | null {
    // Check if there's a real email in the input
    const emailMatch = input.match(
      /\b(?:send(?:\s+it)?|email(?:\s+it)?|send\s+this|email\s+this)?\s*(?:to\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i
    );
    if (emailMatch) return emailMatch[1];

    // Check for implicit intent without an actual email
    const implicitMatch = /\b(send|email)\b.*\b(email|gmail|inbox|this)\b/i.test(input);
    if (implicitMatch) return DEFAULT_EMAIL;

    return null;
  }


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
      const res = await fetch("/api/gemini", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      const extracted = extractEmail(data.text);
      const newSession: Session = {
        id: crypto.randomUUID(),
        imageUrl: previewUrl || "",
        extractedText: data.text,
        chatHistory: [
          {
            role: "assistant",
            text: extracted
              ? `✅ Text extracted successfully. \n\n📧 Would you like me to send this to your ${extracted}?`
              : "✅ Text extracted successfully. \n\n📧 Would you like me to send this to your email?  ",
          },
        ],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(newSession.id);
      setSelectedFile(null);
      setPreviewUrl(null);
      setChatInput("");

      await fetch("/api/save-to-qdrant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedText: data.text,
          chatHistory: newSession.chatHistory,
          metadata: {
            isEmailSent: true, // or false
            // emailContent: data.text, // optional
            timestamp: Date.now(),
          },
        }),
      });

      setTimeout(() => {
        sessionRefs.current[newSession.id]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
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

    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) {
      setError("Session not found");
      setChatLoading(false);
      return;
    }

    // Check if the last assistant message asked to send the email
    const lastAssistantMsg = session.chatHistory
      .slice()
      .reverse()
      .find((msg) => msg.role === "assistant");
    const extracted = extractEmail(session.extractedText); // ✅ get freshest email
    if (
      lastAssistantMsg &&
      lastAssistantMsg.text.includes( extracted
          ? `Would you like me to send this to your ${extracted}?`
          : "Would you like me to send this to your email?"
      ) &&
      /^yes\b/i.test(input)
    ) {
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: extracted || DEFAULT_EMAIL,
            subject: "Extracted Text from Handwritten Image",
            message: session.extractedText,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Send failed");

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  chatHistory: [
                    ...s.chatHistory,
                    { role: "user", text: input },
                    {
                      role: "assistant",
                      text: `✅ Sent the extracted text to **${
                        extracted || DEFAULT_EMAIL
                      }**.`,
                    },
                  ],
                }
              : s
          )
        );
      } catch (err: any) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  chatHistory: [
                    ...s.chatHistory,
                    { role: "user", text: input },
                    {
                      role: "assistant",
                      text: `❌ Failed to send email: ${err.message}`,
                    },
                  ],
                }
              : s
          )
        );
      } finally {
        setChatInput("");
        setChatLoading(false);
      }
      return;
    }

    // Detect explicit or implicit email intent
    const emailTo = detectEmailToSend(input);


    if (emailTo) {
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: emailTo,
            subject: "Extracted Text from Handwritten Image",
            message: session.extractedText,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Send failed");

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  chatHistory: [
                    ...s.chatHistory,
                    { role: "user", text: input },
                    {
                      role: "assistant",
                      text: `📧 Sent the extracted text to ${emailTo}.`,
                    },
                  ],
                }
              : s
          )
        );
      } catch (err: any) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  chatHistory: [
                    ...s.chatHistory,
                    { role: "user", text: input },
                    {
                      role: "assistant",
                      text: `❌ Failed to send email: ${err.message}`,
                    },
                  ],
                }
              : s
          )
        );
      } finally {
        setChatInput("");
        setChatLoading(false);
      }
      return;
    }


    // Normal chat logic
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              chatHistory: [...s.chatHistory, { role: "user", text: input }],
            }
          : s
      )
    );
    setChatInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat: [...session.chatHistory, { role: "user", text: input }],
          extractedText: session.extractedText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                chatHistory: [
                  ...s.chatHistory,
                  { role: "assistant", text: data.reply },
                ],
              }
            : s
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

      // Add success notification to chat history
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                chatHistory: [
                  ...s.chatHistory,
                  {
                    role: "assistant",
                    text: `✅ Extracted text successfully sent to **${email}**.`,
                  },
                ],
              }
            : s
        )
      );

      setEmailInputs((prev) => ({ ...prev, [sessionId]: "" }));
    } catch (err: any) {
      // Add failure notification to chat history
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                chatHistory: [
                  ...s.chatHistory,
                  {
                    role: "assistant",
                    text: `❌ Sorry, failed to send the email. Please try again later.`,
                  },
                ],
              }
            : s
        )
      );
    } finally {
      setEmailLoading(null);
    }
  }


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
                📜 Extracted Text{" "}
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
                          msg.role === "user"
                            ? "bg-blue-100 self-start"
                            : "bg-green-100 self-end"
                        }`}
                      >
                        <strong>
                          {msg.role === "user" ? "You" : "Gemini"}:
                        </strong>{" "}
                        {msg.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Send Form */}
            </div>
          ))}
        </div>

        {/* Chat Input */}
        {activeSessionId && (
          <div className="mt-4 p-4 bg-white border-t shadow">
            <h2 className="font-semibold mb-2 text-gray-800">
              💬 Ask a question
            </h2>
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
