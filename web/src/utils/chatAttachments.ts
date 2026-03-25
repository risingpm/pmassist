export type ChatAttachment = {
  id: string;
  title: string;
  content?: string | null;
};

const MAX_ATTACHMENTS = 3;
const MAX_SNIPPET_LENGTH = 320;

function trimSnippet(value?: string | null) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No extracted text was available from this file.";
  if (normalized.length <= MAX_SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SNIPPET_LENGTH).trim()}...`;
}

export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[],
  fallbackMessage: string
) {
  const baseMessage = message.trim() || fallbackMessage;
  if (!attachments.length) return baseMessage;

  const attachmentBlock = attachments.slice(0, MAX_ATTACHMENTS).map((attachment, index) => {
    return `Attachment ${index + 1}: ${attachment.title}\n${trimSnippet(attachment.content)}`;
  });

  return `${baseMessage}\n\nAttached files:\n${attachmentBlock.join("\n\n")}\n\nUse the attached files as supporting context.`;
}

export function buildAttachmentToastLabel(attachments: ChatAttachment[]) {
  if (!attachments.length) return "";
  return attachments.map((attachment) => attachment.title).join(", ");
}
