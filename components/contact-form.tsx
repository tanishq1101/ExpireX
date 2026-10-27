"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { CONTACT_EMAIL, APP_NAME } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please write a message.");
      return;
    }
    // No backend mailer is wired, so we open the visitor's email client pre-filled.
    const subject = encodeURIComponent(`${APP_NAME} enquiry from ${name || "a user"}`);
    const body = encodeURIComponent(`${message}\n\n— ${name || "Anonymous"}${email ? ` (${email})` : ""}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    toast.success("Opening your email app…");
  }

  return (
    <form onSubmit={onSubmit} className="glass space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="c-name">Your name</Label>
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div>
          <Label htmlFor="c-email">Your email</Label>
          <Input
            id="c-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="c-msg">Message *</Label>
        <Textarea
          id="c-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="How can we help?"
          required
        />
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        <Send className="h-4 w-4" /> Open email draft
      </Button>
      <p className="text-xs text-muted">
        This opens your email app addressed to{" "}
        <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </form>
  );
}
