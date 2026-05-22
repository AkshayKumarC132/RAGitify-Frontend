import { Injectable } from '@angular/core';
import { Conversation, ConversationMessage } from '../models/conversation.model';

export type ExportFormat = 'markdown' | 'json';

/**
 * Builds a downloadable export of a conversation thread in Markdown or JSON.
 */
@Injectable({ providedIn: 'root' })
export class ConversationExportService {
    export(thread: Conversation, messages: ConversationMessage[], format: ExportFormat): void {
        if (format === 'json') {
            this.downloadJson(thread, messages);
        } else {
            this.downloadMarkdown(thread, messages);
        }
    }

    private downloadJson(thread: Conversation, messages: ConversationMessage[]): void {
        const payload = {
            id: thread.id,
            title: thread.title || 'Untitled thread',
            created_at: thread.created_at,
            updated_at: thread.updated_at,
            exported_at: new Date().toISOString(),
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
                created_at: m.created_at,
                metadata: m.metadata ?? undefined
            }))
        };
        this.triggerDownload(
            JSON.stringify(payload, null, 2),
            this.buildFilename(thread, 'json'),
            'application/json'
        );
    }

    private downloadMarkdown(thread: Conversation, messages: ConversationMessage[]): void {
        const lines: string[] = [];
        const title = thread.title || 'Untitled thread';
        lines.push(`# ${title}`);
        lines.push('');
        if (thread.created_at) {
            lines.push(`*Started ${this.formatDate(thread.created_at)}*`);
        }
        lines.push(`*Exported ${this.formatDate(new Date().toISOString())}*`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const message of messages) {
            const speaker = message.role === 'user'
                ? '**You**'
                : message.role === 'assistant'
                    ? '**Assistant**'
                    : `**${message.role}**`;
            const ts = message.created_at ? ` _(${this.formatDate(message.created_at)})_` : '';
            lines.push(`### ${speaker}${ts}`);
            lines.push('');
            lines.push(this.normaliseContent(message.content || ''));
            lines.push('');
        }

        this.triggerDownload(
            lines.join('\n'),
            this.buildFilename(thread, 'md'),
            'text/markdown'
        );
    }

    private normaliseContent(content: string): string {
        // Keep code fences intact, otherwise just return verbatim.
        return content.replace(/\r\n/g, '\n').trim() || '_(no content)_';
    }

    private formatDate(iso: string): string {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }

    private buildFilename(thread: Conversation, ext: string): string {
        const slug = (thread.title || `thread-${thread.id}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'conversation';
        const stamp = new Date().toISOString().slice(0, 10);
        return `${slug}-${stamp}.${ext}`;
    }

    private triggerDownload(body: string, filename: string, mime: string): void {
        const blob = new Blob([body], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
