import type { ReactNode } from 'react'

// Splits on URLs (capturing group keeps them in the result array), then
// trims common trailing punctuation off each match so "see https://x.com."
// doesn't turn the sentence-ending period into part of the link.
const URL_SPLIT_RE = /(https?:\/\/[^\s<>"']+)/g
const URL_TEST_RE = /^https?:\/\//
const TRAILING_PUNCTUATION_RE = /^(.*?)([.,;:!?'")\]]+)$/

export function linkifyText(text: string): ReactNode[] {
  return text.split(URL_SPLIT_RE).map((part, i) => {
    if (!URL_TEST_RE.test(part)) return part
    const trimMatch = part.match(TRAILING_PUNCTUATION_RE)
    const url = trimMatch ? trimMatch[1] : part
    const trailing = trimMatch ? trimMatch[2] : ''
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
        >
          {url}
        </a>
        {trailing}
      </span>
    )
  })
}
