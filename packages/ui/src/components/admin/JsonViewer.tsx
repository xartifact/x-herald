'use client';
"use client"

import { useState, useRef, useEffect } from "react"

import Editor, { loader } from "@monaco-editor/react"
import { Copy, Check } from "lucide-react"
import * as monaco from "monaco-editor"

import { Button } from "../ui/button"

loader.config({ monaco })

export { JsonDiffViewer, HeadersViewer } from './JsonDiffViewer'

interface JsonViewerProps {
  data: unknown
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
      <div className="absolute top-2 right-2 z-10">
        <Button variant="outline" size="sm" onClick={handleCopy} className="bg-background/80 backdrop-blur-sm">
          {copied ? (
            <><Check className="h-3 w-3 mr-1" />已复制</>
          ) : (
            <><Copy className="h-3 w-3 mr-1" />复制</>
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
