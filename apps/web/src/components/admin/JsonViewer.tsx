"use client"

import { useState } from "react"
import Editor from "@monaco-editor/react"
import { Copy, Check } from "lucide-react"

import { Button } from "@/components/ui/button"

interface JsonViewerProps {
  data: unknown
  height?: string
  readonly?: boolean
}

export function JsonViewer({ data, height = "400px", readonly = true }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)

  const jsonString = JSON.stringify(data, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative border rounded-md overflow-hidden">
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
        height={height}
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
