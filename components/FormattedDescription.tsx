'use client';

import React, { useMemo } from 'react';
import { parseDescription } from '@/lib/jobs/description-sections';
import { cn } from '@/lib/utils';

function normalizeHref(href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\/mailto:/i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/mailto:/i, 'mailto:');
  }
  return trimmed;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\\)\*([^*\n]+)(?<!\\)\*|(?<!\\)_([^_\n]+)(?<!\\)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index).replace(/\\([*_])/g, '$1'));
    }

    if (match[2] && match[3]) {
      const href = normalizeHref(match[3]);
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={href}
          target={href.startsWith('mailto:') ? undefined : '_blank'}
          rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}
          className="font-medium text-neutral-900 underline underline-offset-3 decoration-neutral-300 hover:decoration-neutral-700"
        >
          {match[2].replace(/\\([*_])/g, '$1')}
        </a>
      );
    } else {
      const content = (match[4] || match[5] || match[6] || match[7] || '').replace(/\\([*_])/g, '$1');
      const isStrong = Boolean(match[4] || match[5]);
      nodes.push(
        isStrong ? (
          <strong key={`strong-${match.index}`} className="font-semibold text-neutral-900">
            {content}
          </strong>
        ) : (
          <em key={`em-${match.index}`} className="italic">
            {content}
          </em>
        )
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex).replace(/\\([*_])/g, '$1'));
  }

  return nodes;
}

export function FormattedDescription({
  text,
  className,
}: {
  text: string | undefined | null;
  className?: string;
}) {
  const blocks = useMemo(() => parseDescription(text), [text]);

  if (blocks.length === 0) return null;

  return (
    <div 
      className={cn('text-base text-neutral-900', className)}
      style={{
        fontFamily: 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
        lineHeight: '1.75'
      }}
    >
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h3
              key={index}
              className="mt-8 mb-4 first:mt-0 text-lg font-bold text-neutral-900"
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="mb-4 last:mb-0 flex flex-col gap-2 pl-5 list-disc marker:text-neutral-400">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index} className="mb-4 last:mb-0">{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
