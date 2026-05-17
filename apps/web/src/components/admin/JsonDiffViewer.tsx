"use client"

import { useState, useRef, useEffect } from "react"

import { DiffEditor, loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"

loader.config({ monaco })

interface JsonDiffViewerProps {
  original: unknown
  modified: unknown
  originalLabel?: string
  modifiedLabel?: string
  height?: string | "auto"
  onlyDiff?: boolean
  inline?: boolean
}

export function JsonDiffViewer({
  original,
  modified,
  originalLabel = "Original",
  modifiedLabel = "Modified",
  height = "400px",
  onlyDiff = false,
  inline = false,
}: JsonDiffViewerProps) {
  const [measuredHeight, setMeasuredHeight] = useState(400)
  const containerRef = useRef<HTMLDivElement>(null)

  const originalStr = JSON.stringify(original, null, 2) || ""
  const modifiedStr = JSON.stringify(modified, null, 2) || ""

  useEffect(() => {
    if (height !== "auto" || !containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) setMeasuredHeight(h)
      }
    })
    observer.observe(el)
    const h = el.getBoundingClientRect().height
    if (h > 0) setMeasuredHeight(h)
    return () => observer.disconnect()
  }, [height])

  const isAuto = height === "auto"
  const editorHeight = isAuto ? `${measuredHeight}px` : height

  return (
    <div
      ref={containerRef}
      className="relative border rounded-md overflow-hidden"
      style={isAuto ? { flex: 1, minHeight: 0 } : undefined}
    >
      <DiffEditor
        height={editorHeight}
        language="json"
        original={originalStr}
        modified={modifiedStr}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: "on",
          renderWhitespace: "selection",
          folding: true,
          wordWrap: "off",
          diffWordWrap: "off",
          renderSideBySide: !inline,
          originalAriaLabel: originalLabel,
          modifiedAriaLabel: modifiedLabel,
          hideUnchangedRegions: { enabled: onlyDiff },
        }}
      />
    </div>
  )
}

interface HeadersViewerProps {
  headers: Record<string, string> | null
}

export function HeadersViewer({ headers }: HeadersViewerProps) {
  if (!headers || Object.keys(headers).length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        无请求头信息
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[200px_1fr] gap-4 text-sm border-b pb-2">
          <div className="font-medium text-muted-foreground break-all">{key}</div>
          <div className="font-mono text-xs break-all">{value}</div>
        </div>
      ))}
    </div>
  )
}
