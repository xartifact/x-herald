"use client"

import { useState, useRef, useEffect } from "react"
import Editor, { DiffEditor, loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { Copy, Check } from "lucide-react"

import { Button } from "@/ui/button"

// 配置 Monaco Editor 使用本地文件而不是 CDN
loader.config({ monaco })

interface JsonViewerProps {
  data: unknown
  /** 固定高度（CSS 值）或 "auto" 自动填充父容器 */
  height?: string | "auto"
  readonly?: boolean
}

export function JsonViewer({ data, height = "400px", readonly = true }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)
  const [measuredHeight, setMeasuredHeight] = useState(400)
  const containerRef = useRef<HTMLDivElement>(null)

  const jsonString = JSON.stringify(data, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // auto 模式：用 ResizeObserver 测量容器高度
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
    // 初始测量
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
      <div className="absolute top-2 right-2 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="bg-background/80 backdrop-blur-sm"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              复制
            </>
          )}
        </Button>
      </div>
      <Editor
        height={editorHeight}
        defaultLanguage="json"
        value={jsonString}
        theme="vs-dark"
        options={{
          readOnly: readonly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: "on",
          renderWhitespace: "selection",
          folding: true,
          wordWrap: "on",
        }}
      />
    </div>
  )
}

interface JsonDiffViewerProps {
  original: unknown
  modified: unknown
  originalLabel?: string
  modifiedLabel?: string
  height?: string | "auto"
  /** 是否只显示差异区域（折叠无变化部分） */
  onlyDiff?: boolean
  /** 是否 inline 模式（单栏）vs side-by-side（双栏） */
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
          wordWrap: "on",
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
