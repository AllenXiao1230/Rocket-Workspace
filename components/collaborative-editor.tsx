"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { DocumentCollaborationPanel } from "@/components/document-collaboration-panel";
import { DocumentAttachments } from "@/components/document-attachments";
import { DocumentWorkflowPanel } from "@/components/document-workflow-panel";
import { DocumentSyncBlocks } from "@/components/document-sync-blocks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormDialog } from "@/components/form-dialog";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { useMenuNavigation } from "@/lib/use-menu-navigation";
import { mergeMarkdown } from "@/lib/markdown-conflict";
import { Callout, isSafeDocumentEmbedUrl, SecureEmbed } from "@/lib/editor-extensions";

type DocumentData = {
  id: string;
  title: string;
  icon: string;
  content: Record<string, unknown>;
  markdown: string | null;
};
type SaveSnapshot = { content: Record<string, unknown>; markdown: string };
type FloatingPosition = { x: number; y: number };
type TablePosition = FloatingPosition & { bottom: number; width: number };
type EditorContextMenu = FloatingPosition & {
  kind: "table" | "selection" | "block";
};
const pageEmojiGroups = [
  { label: "常用", icons: ["📄", "📝", "📌", "⭐", "💡", "✅", "📋", "📚"] },
  { label: "專案", icons: ["🚀", "🛰️", "🧪", "⚙️", "🔧", "📈", "🗓️", "🎯"] },
  { label: "內容", icons: ["💬", "📦", "🔗", "🗂️", "🧩", "🔒", "⚠️", "🌟"] },
];
const collaboratorColor = (name: string) =>
  ["#7aab4d", "#3e9c8b", "#5e8fd1", "#bd7cce", "#d08052", "#ba6767"][
    Array.from(name).reduce((value, char) => value + char.charCodeAt(0), 0) % 6
  ];
const tableAtSelection = ($from: {
  depth: number;
  node: (depth: number) => { type: { name: string } };
}) =>
  Array.from(
    { length: $from.depth + 1 },
    (_, depth) => $from.node(depth).type.name,
  ).includes("table");

export function CollaborativeEditor({
  projectId,
  document,
  user,
  editable,
  onCreateSubpage,
  onCreateDatabase,
  onIconChange,
  onDelete,
  documentChoices,
}: {
  projectId: string;
  document: DocumentData;
  user: { name: string; role: string };
  editable: boolean;
  onCreateSubpage?: (parentId: string) => void;
  onCreateDatabase?: (parentId: string) => void;
  onIconChange?: (icon: string) => void;
  onDelete?: () => void;
  documentChoices?: Array<{ id: string; title: string }>;
}) {
  const collaborationRoom = document.id.startsWith("notion-")
    ? `document-${document.id}-notion-markdown-v2`
    : `document-${document.id}`;
  const [status, setStatus] = useState(editable ? "正在連接協作服務…" : "檢視模式");
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceMarkdown, setSourceMarkdown] = useState(document.markdown || "");
  const [externalChanged, setExternalChanged] = useState(false);
  const [iconPicker, setIconPicker] = useState(false);
  const [customIcon, setCustomIcon] = useState(document.icon || "📄");
  const [slashMenu, setSlashMenu] = useState(false);
  const [slashPosition, setSlashPosition] = useState<FloatingPosition>({
    x: 120,
    y: 180,
  });
  const [tablePosition, setTablePosition] = useState<TablePosition | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenu | null>(null);
  const [activeProvider, setActiveProvider] = useState<WebsocketProvider | null>(null);
  const [onlineMembers, setOnlineMembers] = useState(0);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [insertDialog, setInsertDialog] = useState<"link" | "image" | "embed" | null>(
    null,
  );
  const [reloadMarkdown, setReloadMarkdown] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const pending = useRef<SaveSnapshot | null>(null);
  const ydoc = useRef(new Y.Doc()).current;
  const provider = useRef<WebsocketProvider | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const persist = useCallback(async () => {
    if (saving.current || !pending.current || !editable) return;
    const snapshot = pending.current;
    pending.current = null;
    saving.current = true;
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      setStatus(
        response.ok
          ? "已儲存 · Markdown 已更新"
          : response.status === 403
            ? "唯讀角色，無法儲存"
            : "未儲存：將在下次變更時重試",
      );
    } catch {
      setStatus("網路中斷，內容會在恢復連線後再儲存");
      pending.current = snapshot;
    } finally {
      saving.current = false;
      if (pending.current) void persist();
    }
  }, [document.id, editable]);
  const queueSave = useCallback(
    (snapshot: SaveSnapshot) => {
      if (!editable) return;
      pending.current = snapshot;
      setStatus("儲存中…");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void persist();
      }, 650);
    },
    [editable, persist],
  );
  async function uploadLocalImages(files: File[]) {
    if (!editable || !editor) return;
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return setStatus("請選擇或拖入圖片檔案");
    for (const [index, file] of images.entries()) {
      setStatus(`正在上傳圖片 ${index + 1}/${images.length}：${file.name}`);
      const data = new FormData();
      data.append("documentId", document.id);
      data.append("file", file);
      try {
        const response = await fetch("/api/attachments", {
          method: "POST",
          body: data,
        });
        const result = (await response.json()) as {
          id?: string;
          filename?: string;
          error?: string;
        };
        if (!response.ok || !result.id) {
          setStatus(result.error || `圖片「${file.name}」上傳失敗`);
          continue;
        }
        editor
          .chain()
          .focus()
          .setImage({
            src: `/api/attachments?id=${encodeURIComponent(result.id)}`,
            alt: result.filename || file.name,
          })
          .run();
      } catch {
        setStatus(`圖片「${file.name}」上傳失敗，請檢查網路後重試`);
      }
    }
    setStatus(
      images.length > 1
        ? `已插入 ${images.length} 張圖片，正在儲存`
        : "圖片已插入文件，正在儲存",
    );
  }
  function openLocalImagePicker() {
    if (editable) imageInputRef.current?.click();
  }
  function onLocalImagePicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    void uploadLocalImages(files);
  }
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Underline,
        Image.configure({
          allowBase64: false,
          HTMLAttributes: { loading: "lazy" },
        }),
        Callout,
        SecureEmbed,
        Link.configure({
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown.configure({ markedOptions: { gfm: true } }),
        Collaboration.configure({ document: ydoc }),
        ...(activeProvider
          ? [
              CollaborationCaret.configure({
                provider: activeProvider,
                user: { name: user.name, color: collaboratorColor(user.name) },
              }),
            ]
          : []),
        Placeholder.configure({
          placeholder: "輸入 / 開始寫作，變更會即時同步給在線成員。",
        }),
      ],
      editable,
      editorProps: {
        attributes: { "aria-label": "協作文件內容" },
        handleKeyDown: (view, event) => {
          if (!editable) return false;
          const { $from } = view.state.selection;
          if (
            event.key === "/" &&
            $from.parent.type.name === "paragraph" &&
            !$from.parent.textContent
          ) {
            const coords = view.coordsAtPos(view.state.selection.from);
            event.preventDefault();
            setSlashPosition({ x: coords.left, y: coords.bottom + 8 });
            setSlashMenu(true);
            return true;
          }
          if (event.key === "Escape") {
            setSlashMenu(false);
            setContextMenu(null);
          }
          return false;
        },
        handleDOMEvents: {
          contextmenu: (view, event) => {
            if (!editable) return false;
            event.preventDefault();
            setSlashMenu(false);
            const $from = view.state.selection.$from;
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              kind: tableAtSelection($from)
                ? "table"
                : view.state.selection.empty
                  ? "block"
                  : "selection",
            });
            return true;
          },
          dragenter: (_, event) => {
            if (
              !editable ||
              !Array.from(event.dataTransfer?.files || []).some((file) =>
                file.type.startsWith("image/"),
              )
            )
              return false;
            event.preventDefault();
            setImageDropActive(true);
            return true;
          },
          dragover: (_, event) => {
            if (
              !editable ||
              !Array.from(event.dataTransfer?.files || []).some((file) =>
                file.type.startsWith("image/"),
              )
            )
              return false;
            event.preventDefault();
            setImageDropActive(true);
            return true;
          },
          dragleave: () => {
            setImageDropActive(false);
            return false;
          },
          drop: () => {
            setImageDropActive(false);
            return false;
          },
        },
        handleDrop: (_, event, moved) => {
          if (moved || !editable) return false;
          const images = Array.from(event.dataTransfer?.files || []).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!images.length) return false;
          event.preventDefault();
          void uploadLocalImages(images);
          return true;
        },
        handlePaste: (_, event) => {
          if (!editable) return false;
          const images = Array.from(event.clipboardData?.files || []).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!images.length) return false;
          event.preventDefault();
          void uploadLocalImages(images);
          return true;
        },
      },
      onSelectionUpdate: ({ editor: current }) => {
        if (!current.isActive("table")) return setTablePosition(null);
        const dom = current.view.domAtPos(current.state.selection.from).node;
        const element =
          dom.nodeType === Node.ELEMENT_NODE ? (dom as HTMLElement) : dom.parentElement;
        const table = element?.closest("table");
        const rect = table?.getBoundingClientRect();
        if (rect)
          setTablePosition({
            x: rect.left,
            y: rect.top,
            bottom: rect.bottom,
            width: rect.width,
          });
        else {
          const coords = current.view.coordsAtPos(current.state.selection.from);
          setTablePosition({
            x: coords.left,
            y: coords.top,
            bottom: coords.bottom,
            width: 0,
          });
        }
      },
      onUpdate: ({ editor: current }) =>
        queueSave({
          content: current.getJSON() as Record<string, unknown>,
          markdown: current.getMarkdown(),
        }),
    },
    [activeProvider],
  );
  const closeFloatingMenus = useCallback(() => {
    setSlashMenu(false);
    setContextMenu(null);
    editor?.commands.focus();
  }, [editor]);
  const iconPickerDialogRef = useDialogFocus<HTMLElement>(iconPicker, () =>
    setIconPicker(false),
  );
  const { menuRef: slashMenuRef, onKeyDown: onSlashMenuKeyDown } = useMenuNavigation(
    slashMenu,
    closeFloatingMenus,
  );
  const { menuRef: editorContextMenuRef, onKeyDown: onEditorContextMenuKeyDown } =
    useMenuNavigation(Boolean(contextMenu), closeFloatingMenus);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  useEffect(() => {
    let disposed = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/documents/${document.id}/markdown`, {
          cache: "no-store",
        });
        const result = (await response.json()) as { externalChanged?: boolean };
        if (!disposed && response.ok) setExternalChanged(Boolean(result.externalChanged));
      } catch {
        /* keep editing available while the file check is offline */
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [document.id]);
  useEffect(() => {
    const localPersistence = new IndexeddbPersistence(
      `rocket-workspace-${collaborationRoom}`,
      ydoc,
    );
    const onSynced = () =>
      setStatus((current) =>
        current.includes("已連線") ? current : "離線內容已復原，正在連線…",
      );
    localPersistence.on("synced", onSynced);
    return () => {
      localPersistence.off("synced", onSynced);
      void localPersistence.destroy();
    };
  }, [collaborationRoom, ydoc]);
  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const response = await fetch(
          `/api/documents/${document.id}/collaboration-token`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error("token");
        const { token, readOnly, disabled } = (await response.json()) as {
          token?: string;
          readOnly?: boolean;
          disabled?: boolean;
        };
        if (cancelled) return;
        if (disabled) {
          setStatus("管理者已停用即時協作；內容仍會儲存至伺服器。");
          return;
        }
        if (readOnly || !token) {
          setStatus("檢視模式 · 權限保護的即時編輯已停用");
          return;
        }
        const url = process.env.NEXT_PUBLIC_COLLABORATION_URL || "ws://localhost:1234";
        const nextProvider = new WebsocketProvider(url, collaborationRoom, ydoc, {
          params: { token },
        });
        provider.current = nextProvider;
        setActiveProvider(nextProvider);
        nextProvider.on("status", ({ status: nextStatus }: { status: string }) =>
          setStatus(
            nextStatus === "connected"
              ? editable
                ? "已連線 · 即時協作已啟用"
                : "檢視模式 · 即時內容已連線"
              : "協作服務重新連線中…",
          ),
        );
        const updatePresence = () =>
          setOnlineMembers(
            Array.from(nextProvider.awareness.getStates().values()).filter((value) =>
              Boolean((value as { user?: { name?: string } }).user?.name),
            ).length,
          );
        nextProvider.awareness.on("change", updatePresence);
        updatePresence();
        const seedEmptyDocument = () => {
          const current = editorRef.current;
          if (!current || current.getText().trim()) return;
          const source = document.markdown || document.content;
          current.commands.setContent(
            source,
            document.markdown ? { contentType: "markdown" } : undefined,
          );
        };
        nextProvider.on("sync", (synced: boolean) => {
          if (!synced) return;
          // A websocket can briefly report "disconnected" while its initial
          // Yjs handshake is settling. A completed sync is the reliable
          // signal that this document is ready for collaboration.
          setStatus(editable ? "已連線 · 即時協作已啟用" : "檢視模式 · 即時內容已連線");
          queueMicrotask(seedEmptyDocument);
        });
        // A fast local connection can finish synchronising before the listener is
        // attached. Checking the current state makes the initial seed reliable.
        if (nextProvider.synced) queueMicrotask(seedEmptyDocument);
      } catch {
        setStatus(
          editable ? "協作服務不可用；仍會嘗試儲存內容。" : "檢視模式 · 協作服務不可用",
        );
      }
    }
    void connect();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persist();
      provider.current?.destroy();
      provider.current = null;
      setActiveProvider(null);
      ydoc.destroy();
    };
  }, [
    collaborationRoom,
    document.content,
    document.id,
    document.markdown,
    editable,
    persist,
    ydoc,
  ]);
  const updateTitle = useCallback(
    (title: string) => {
      if (!editable || !title.trim()) return;
      void fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      }).then((response) => setStatus(response.ok ? "標題已儲存" : "標題未儲存"));
    },
    [document.id, editable],
  );
  function saveIcon(icon: string) {
    if (!editable || !icon.trim()) return;
    void fetch(`/api/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon: icon.trim() }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) return setStatus(result.error || "頁面圖標未儲存");
      onIconChange?.(result.icon);
      setCustomIcon(result.icon);
      setIconPicker(false);
      setStatus("頁面圖標已更新");
    });
  }
  function openInsertDialog(kind: "link" | "image" | "embed") {
    if (editable) setInsertDialog(kind);
  }
  function applyInsert(values: Record<string, string>) {
    const url = values.url.trim();
    if (!url) return false;
    if (insertDialog === "link") {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      return true;
    }
    if (!isSafeDocumentEmbedUrl(url)) {
      setStatus(
        `${insertDialog === "image" ? "圖片" : "嵌入內容"}僅接受有效的 HTTPS 網址`,
      );
      return false;
    }
    if (insertDialog === "image") {
      editor?.chain().focus().setImage({ src: url, alt: values.label.trim() }).run();
      return true;
    }
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "secureEmbed",
        attrs: { url, label: values.label.trim() || "外部嵌入內容" },
      })
      .run();
    return true;
  }
  function openSource() {
    setSourceMarkdown(editor?.getMarkdown() || document.markdown || "");
    setSourceMode(true);
  }
  function applySource() {
    if (!editor || !editable) return;
    try {
      editor.commands.setContent(sourceMarkdown, { contentType: "markdown" });
      setSourceMode(false);
      setStatus("Markdown 已套用並等待儲存");
    } catch {
      setStatus("Markdown 格式無法解析，未改動文件");
    }
  }
  async function reloadFromFile() {
    const response = await fetch(`/api/documents/${document.id}/markdown`, {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      markdown?: string;
      error?: string;
    };
    if (!response.ok || result.markdown === undefined)
      return setStatus(result.error || "無法讀取 Markdown 檔案");
    setSourceMarkdown(result.markdown);
    if (!editable) return setSourceMode(true);
    setReloadMarkdown(result.markdown);
  }
  function applyReloadFromFile() {
    if (!reloadMarkdown) return;
    editor?.commands.setContent(reloadMarkdown, { contentType: "markdown" });
    setExternalChanged(false);
    setSourceMode(false);
    setReloadMarkdown(null);
    setStatus("已載入外部 Markdown，正在建立新的協作版本");
  }
  async function previewThreeWayMerge() {
    const response = await fetch(`/api/documents/${document.id}/markdown`, {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      markdown?: string;
      baseMarkdown?: string;
      error?: string;
    };
    if (!response.ok || result.markdown === undefined)
      return setStatus(result.error || "無法讀取 Markdown 檔案");
    const merged = mergeMarkdown(
      result.baseMarkdown || "",
      editor?.getMarkdown() || document.markdown || "",
      result.markdown,
    );
    setSourceMarkdown(merged.merged);
    setSourceMode(true);
    setStatus(merged.summary);
  }
  async function keepOnlineVersion() {
    if (!editor || !editable) return;
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editor.getJSON(),
          markdown: editor.getMarkdown(),
        }),
      });
      if (!response.ok) throw new Error();
      setExternalChanged(false);
      setStatus("已保留線上版本並覆寫外部 Markdown");
    } catch {
      setStatus("無法覆寫外部 Markdown，請稍後再試");
    }
  }
  async function copyMarkdown() {
    const markdown = editor?.getMarkdown() || sourceMarkdown;
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Markdown 已複製到剪貼簿");
    } catch {
      setStatus("無法存取剪貼簿，請使用原始碼模式複製");
    }
  }
  const command = (run: () => boolean) => () => {
    if (editable) run();
  };
  const menuAction = (run: () => void) => () => {
    run();
    closeFloatingMenus();
  };
  function openSlashMenu() {
    if (!editor || !editable) return;
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setSlashPosition({ x: coords.left, y: coords.bottom + 8 });
    setContextMenu(null);
    setSlashMenu((current) => !current);
  }
  function tableAction(
    action:
      | "addColumnBefore"
      | "addColumnAfter"
      | "deleteColumn"
      | "addRowBefore"
      | "addRowAfter"
      | "deleteRow"
      | "mergeCells"
      | "splitCell"
      | "toggleHeaderRow"
      | "deleteTable",
  ) {
    if (!editor || !editable) return;
    const chain = editor.chain().focus();
    if (action === "addColumnBefore") chain.addColumnBefore().run();
    else if (action === "addColumnAfter") chain.addColumnAfter().run();
    else if (action === "deleteColumn") chain.deleteColumn().run();
    else if (action === "addRowBefore") chain.addRowBefore().run();
    else if (action === "addRowAfter") chain.addRowAfter().run();
    else if (action === "deleteRow") chain.deleteRow().run();
    else if (action === "mergeCells") chain.mergeCells().run();
    else if (action === "splitCell") chain.splitCell().run();
    else if (action === "toggleHeaderRow") chain.toggleHeaderRow().run();
    else chain.deleteTable().run();
    closeFloatingMenus();
  }
  function insertBlock(
    kind:
      | "paragraph"
      | "heading"
      | "task"
      | "quote"
      | "callout"
      | "code"
      | "table"
      | "divider"
      | "image"
      | "uploadImage"
      | "embed",
  ) {
    if (!editor || !editable) return;
    closeFloatingMenus();
    const chain = editor.chain().focus();
    if (kind === "paragraph") chain.setParagraph().run();
    else if (kind === "heading") chain.toggleHeading({ level: 2 }).run();
    else if (kind === "task") chain.toggleTaskList().run();
    else if (kind === "quote") chain.toggleBlockquote().run();
    else if (kind === "callout") chain.wrapIn("callout", { tone: "info" }).run();
    else if (kind === "code") chain.toggleCodeBlock().run();
    else if (kind === "table")
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (kind === "image") openInsertDialog("image");
    else if (kind === "uploadImage") openLocalImagePicker();
    else if (kind === "embed") openInsertDialog("embed");
    else chain.setHorizontalRule().run();
  }
  return (
    <article className="document">
      <div className="document-title-row">
        <button
          className="document-icon"
          aria-label="變更頁面圖標"
          disabled={!editable}
          onClick={() => {
            setCustomIcon(document.icon || "📄");
            setIconPicker(true);
          }}
        >
          {document.icon || "📄"}
        </button>
        <input
          className="document-title"
          aria-label="文件標題"
          defaultValue={document.title}
          readOnly={!editable}
          onBlur={(event) => updateTitle(event.currentTarget.value)}
        />
      </div>
      {iconPicker && (
        <div
          className="emoji-picker-backdrop"
          role="presentation"
          onMouseDown={() => setIconPicker(false)}
        >
          <section
            ref={iconPickerDialogRef}
            className="emoji-picker"
            role="dialog"
            aria-modal="true"
            aria-label="選擇頁面圖標"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>選擇頁面圖標</strong>
                <span>選取 Emoji 後會立即套用。</span>
              </div>
              <button aria-label="關閉" onClick={() => setIconPicker(false)}>
                ×
              </button>
            </header>
            {pageEmojiGroups.map((group) => (
              <div className="emoji-group" key={group.label}>
                <span>{group.label}</span>
                <div>
                  {group.icons.map((icon) => (
                    <button
                      key={icon}
                      className={document.icon === icon ? "active" : ""}
                      onClick={() => saveIcon(icon)}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <form
              className="emoji-custom"
              onSubmit={(event) => {
                event.preventDefault();
                saveIcon(customIcon);
              }}
            >
              <label>
                自訂 Emoji
                <input
                  value={customIcon}
                  onChange={(event) => setCustomIcon(event.target.value)}
                  maxLength={16}
                />
              </label>
              <button type="submit">套用</button>
            </form>
          </section>
        </div>
      )}
      <div className="editor-toolbar" aria-label="文件格式工具列">
        <button disabled={!editable} onClick={openSlashMenu}>
          ＋ 區塊
        </button>
        <button
          className={editor?.isActive("bold") ? "active" : ""}
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().toggleBold().run() || false)}
          aria-label="粗體"
        >
          <b>B</b>
        </button>
        <button
          className={editor?.isActive("italic") ? "active" : ""}
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().toggleItalic().run() || false)}
          aria-label="斜體"
        >
          <i>I</i>
        </button>
        <button
          className={editor?.isActive("underline") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleUnderline().run() || false,
          )}
          aria-label="底線"
        >
          <u>U</u>
        </button>
        <button
          className={editor?.isActive("strike") ? "active" : ""}
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().toggleStrike().run() || false)}
          aria-label="刪除線"
        >
          S
        </button>
        <button
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().unsetAllMarks().clearNodes().run() || false,
          )}
        >
          清除格式
        </button>
        <span />
        <button
          className={editor?.isActive("heading", { level: 1 }) ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleHeading({ level: 1 }).run() || false,
          )}
        >
          H1
        </button>
        <button
          className={editor?.isActive("heading", { level: 2 }) ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleHeading({ level: 2 }).run() || false,
          )}
        >
          H2
        </button>
        <button
          className={editor?.isActive("heading", { level: 3 }) ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleHeading({ level: 3 }).run() || false,
          )}
        >
          H3
        </button>
        <button
          className={editor?.isActive("bulletList") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleBulletList().run() || false,
          )}
        >
          • 清單
        </button>
        <button
          className={editor?.isActive("orderedList") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleOrderedList().run() || false,
          )}
        >
          1. 清單
        </button>
        <button
          className={editor?.isActive("taskList") ? "active" : ""}
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().toggleTaskList().run() || false)}
        >
          ☑ 待辦
        </button>
        <button
          className={editor?.isActive("blockquote") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleBlockquote().run() || false,
          )}
        >
          ❝ 提示
        </button>
        <button
          className={editor?.isActive("callout") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () =>
              editor?.chain().focus().wrapIn("callout", { tone: "info" }).run() || false,
          )}
        >
          ⓘ Callout
        </button>
        <button disabled={!editable} onClick={openLocalImagePicker}>
          ⇧ 上傳圖片
        </button>
        <button disabled={!editable} onClick={() => openInsertDialog("image")}>
          ▧ 圖片網址
        </button>
        <button disabled={!editable} onClick={() => openInsertDialog("embed")}>
          ▣ 嵌入
        </button>
        <button
          className={editor?.isActive("codeBlock") ? "active" : ""}
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().toggleCodeBlock().run() || false,
          )}
        >
          &lt;/&gt;
        </button>
        <button
          disabled={!editable}
          onClick={command(
            () => editor?.chain().focus().setHorizontalRule().run() || false,
          )}
        >
          — 分隔線
        </button>
        <button
          disabled={!editable}
          onClick={command(
            () =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run() || false,
          )}
        >
          ▦ 表格
        </button>
        <button
          className={editor?.isActive("link") ? "active" : ""}
          disabled={!editable}
          onClick={() => openInsertDialog("link")}
        >
          ↗ 連結
        </button>
        <span />
        <button
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().undo().run() || false)}
          aria-label="復原"
        >
          ↶
        </button>
        <button
          disabled={!editable}
          onClick={command(() => editor?.chain().focus().redo().run() || false)}
          aria-label="重做"
        >
          ↷
        </button>
        <button onClick={openSource}>MD 原始碼</button>
        <button onClick={() => void reloadFromFile()}>讀取檔案</button>
        <button onClick={() => void copyMarkdown()}>複製 MD</button>
        <a href={`/api/documents/${document.id}/markdown?download=1`}>下載 .md</a>
        {editable && (
          <>
            <button onClick={() => onCreateSubpage?.(document.id)}>＋ 子頁面</button>
            <button className="editor-danger" onClick={() => onDelete?.()}>
              刪除頁面
            </button>
          </>
        )}
      </div>
      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={onLocalImagePicked}
      />
      {slashMenu && (
        <div
          ref={slashMenuRef}
          className="slash-menu floating-menu"
          style={{ left: slashPosition.x, top: slashPosition.y }}
          role="menu"
          aria-label="新增內容區塊"
          onKeyDown={onSlashMenuKeyDown}
        >
          <p>
            插入區塊 <kbd>Esc</kbd> 關閉
          </p>
          <div>
            <button role="menuitem" onClick={() => insertBlock("paragraph")}>
              ¶ 文字
            </button>
            <button role="menuitem" onClick={() => insertBlock("heading")}>
              H 標題
            </button>
            <button role="menuitem" onClick={() => insertBlock("task")}>
              ☑ 待辦清單
            </button>
            <button role="menuitem" onClick={() => insertBlock("quote")}>
              ❝ 提示區塊
            </button>
            <button role="menuitem" onClick={() => insertBlock("callout")}>
              ⓘ Callout
            </button>
            <button role="menuitem" onClick={() => insertBlock("uploadImage")}>
              ⇧ 上傳圖片
            </button>
            <button role="menuitem" onClick={() => insertBlock("image")}>
              ▧ 圖片網址
            </button>
            <button role="menuitem" onClick={() => insertBlock("embed")}>
              ▣ 嵌入內容
            </button>
            <button role="menuitem" onClick={() => insertBlock("table")}>
              ▦ 表格
            </button>
            <button role="menuitem" onClick={() => insertBlock("code")}>
              {"</>"} 程式碼
            </button>
            <button role="menuitem" onClick={() => insertBlock("divider")}>
              — 分隔線
            </button>
          </div>
        </div>
      )}
      {editor?.isActive("table") && editable && tablePosition && (
        <>
          <div
            className="table-edge-controls"
            style={{ left: tablePosition.x, top: tablePosition.y }}
            aria-label="表格欄列快捷操作"
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="table-column-controls">
              <button
                title="在目前欄右側插入欄"
                aria-label="新增欄"
                onClick={() => tableAction("addColumnAfter")}
              >
                ＋
              </button>
              <button
                title="移除目前欄"
                aria-label="移除欄"
                onClick={() => tableAction("deleteColumn")}
              >
                −
              </button>
            </div>
            <div className="table-row-controls">
              <button
                title="在目前列下方插入列"
                aria-label="新增列"
                onClick={() => tableAction("addRowAfter")}
              >
                ＋
              </button>
              <button
                title="移除目前列"
                aria-label="移除列"
                onClick={() => tableAction("deleteRow")}
              >
                −
              </button>
            </div>
          </div>
          <div
            className="table-toolbar floating-menu"
            style={{ left: tablePosition.x, top: tablePosition.bottom + 8 }}
            aria-label="表格操作"
            onMouseDown={(event) => event.preventDefault()}
          >
            <span>表格操作</span>
            <button onClick={() => tableAction("addColumnBefore")}>欄＋左</button>
            <button onClick={() => tableAction("addColumnAfter")}>欄＋右</button>
            <button onClick={() => tableAction("deleteColumn")}>刪欄</button>
            <button onClick={() => tableAction("addRowBefore")}>列＋上</button>
            <button onClick={() => tableAction("addRowAfter")}>列＋下</button>
            <button onClick={() => tableAction("deleteRow")}>刪列</button>
            <button onClick={() => tableAction("mergeCells")}>合併儲存格</button>
            <button onClick={() => tableAction("splitCell")}>分割儲存格</button>
            <button onClick={() => tableAction("toggleHeaderRow")}>切換標題列</button>
            <button className="editor-danger" onClick={() => tableAction("deleteTable")}>
              刪除表格
            </button>
          </div>
        </>
      )}
      {contextMenu && (
        <div
          ref={editorContextMenuRef}
          className="editor-context-menu floating-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={onEditorContextMenuKeyDown}
        >
          {contextMenu.kind === "table" ? (
            <>
              <strong>表格</strong>
              <button role="menuitem" onClick={() => tableAction("addRowAfter")}>
                新增下一列
              </button>
              <button role="menuitem" onClick={() => tableAction("addColumnAfter")}>
                新增右側欄
              </button>
              <button role="menuitem" onClick={() => tableAction("mergeCells")}>
                合併儲存格
              </button>
              <button role="menuitem" onClick={() => tableAction("deleteRow")}>
                刪除此列
              </button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => tableAction("deleteTable")}
              >
                刪除表格
              </button>
            </>
          ) : contextMenu.kind === "selection" ? (
            <>
              <strong>已選取文字</strong>
              <button
                role="menuitem"
                onClick={menuAction(() => {
                  editor?.chain().focus().toggleBold().run();
                })}
              >
                粗體
              </button>
              <button
                role="menuitem"
                onClick={menuAction(() => {
                  editor?.chain().focus().toggleItalic().run();
                })}
              >
                斜體
              </button>
              <button
                role="menuitem"
                onClick={menuAction(() => {
                  editor?.chain().focus().toggleUnderline().run();
                })}
              >
                底線
              </button>
              <button
                role="menuitem"
                onClick={menuAction(() => openInsertDialog("link"))}
              >
                加入連結
              </button>
              <button
                role="menuitem"
                onClick={menuAction(() => {
                  editor?.chain().focus().unsetAllMarks().run();
                })}
              >
                清除格式
              </button>
            </>
          ) : (
            <>
              <strong>目前區塊</strong>
              <button role="menuitem" onClick={menuAction(() => insertBlock("heading"))}>
                轉為標題
              </button>
              <button
                role="menuitem"
                onClick={menuAction(() => {
                  editor?.chain().focus().toggleBulletList().run();
                })}
              >
                轉為清單
              </button>
              <button role="menuitem" onClick={menuAction(() => insertBlock("task"))}>
                轉為待辦
              </button>
              <button role="menuitem" onClick={menuAction(() => insertBlock("quote"))}>
                轉為提示
              </button>
              <button role="menuitem" onClick={menuAction(() => insertBlock("table"))}>
                插入表格
              </button>
            </>
          )}
        </div>
      )}
      {externalChanged && (
        <aside className="markdown-conflict" role="status">
          <strong>偵測到專案資料夾中的 Markdown 已被外部修改</strong>
          <span>
            線上協作內容尚未被覆寫。你可比較三方基線；若兩邊都有改動，系統會以衝突標記保留兩個版本。
          </span>
          <div>
            <button onClick={() => void previewThreeWayMerge()}>三方合併預覽</button>
            <button onClick={() => void reloadFromFile()}>檢視並載入檔案</button>
            {editable && (
              <button
                className="markdown-conflict-keep"
                onClick={() => void keepOnlineVersion()}
              >
                保留線上版本
              </button>
            )}
          </div>
        </aside>
      )}
      {sourceMode ? (
        <section className="markdown-source">
          <div>
            <strong>Markdown 原始碼</strong>
            <span>套用後會轉成可協作的區塊；不支援的語法會保留為一般文字。</span>
          </div>
          <textarea
            aria-label="Markdown 原始碼"
            value={sourceMarkdown}
            readOnly={!editable}
            onChange={(event) => setSourceMarkdown(event.target.value)}
            spellCheck={false}
          />{" "}
          <footer>
            {editable && (
              <button className="collab-primary" onClick={applySource}>
                套用 Markdown
              </button>
            )}
            <button className="source-close" onClick={() => setSourceMode(false)}>
              關閉
            </button>
          </footer>
        </section>
      ) : (
        <div
          className={
            imageDropActive
              ? "editor-content-shell image-drop-active"
              : "editor-content-shell"
          }
        >
          {imageDropActive && (
            <div className="image-drop-hint">放開即可上傳並插入圖片</div>
          )}
          <EditorContent editor={editor} />
        </div>
      )}
      <p className="editor-status">
        {status}
        {onlineMembers ? ` · 線上 ${onlineMembers} 位` : ""}
      </p>
      {editable && (
        <div className="document-child-actions">
          <span>在此頁面下新增</span>
          <button onClick={() => onCreateSubpage?.(document.id)}>＋ 子頁面</button>
          <button onClick={() => onCreateDatabase?.(document.id)}>▦ 資料庫</button>
        </div>
      )}
      <DocumentWorkflowPanel
        documentId={document.id}
        projectId={projectId}
        canWrite={editable}
      />
      <DocumentSyncBlocks
        documentId={document.id}
        editable={editable}
        documents={documentChoices || []}
      />
      <DocumentCollaborationPanel documentId={document.id} canWrite={editable} />
      <DocumentAttachments
        documentId={document.id}
        canWrite={editable}
        canPurge={user.role === "OWNER" || user.role === "ADMIN"}
        onInsertImage={(attachment) =>
          editor
            ?.chain()
            .focus()
            .setImage({
              src: `/api/attachments?id=${encodeURIComponent(attachment.id)}`,
              alt: attachment.filename,
            })
            .run()
        }
      />
      {insertDialog && (
        <FormDialog
          title={
            insertDialog === "link"
              ? "加入連結"
              : insertDialog === "image"
                ? "插入圖片網址"
                : "嵌入外部內容"
          }
          description={
            insertDialog === "link"
              ? "會套用至目前選取的文字。"
              : "僅接受有效的 HTTPS 公開網址。"
          }
          submitLabel={insertDialog === "link" ? "套用連結" : "插入"}
          fields={
            insertDialog === "link"
              ? [
                  {
                    name: "url",
                    label: "連結網址",
                    type: "url",
                    required: true,
                    placeholder: "https://example.com",
                  },
                ]
              : [
                  {
                    name: "url",
                    label: insertDialog === "image" ? "圖片網址" : "嵌入網址",
                    type: "url",
                    required: true,
                    placeholder: "https://example.com",
                  },
                  {
                    name: "label",
                    label:
                      insertDialog === "image"
                        ? "圖片替代文字（可留空）"
                        : "嵌入標題（可留空）",
                    placeholder:
                      insertDialog === "image" ? "描述圖片內容" : "外部嵌入內容",
                  },
                ]
          }
          onCancel={() => setInsertDialog(null)}
          onSubmit={applyInsert}
        />
      )}
      {reloadMarkdown !== null && (
        <ConfirmDialog
          title="以檔案內容覆蓋目前文件？"
          description="系統會先保存目前版本，再以資料夾中的 Markdown 取代編輯器內容。"
          confirmLabel="載入並覆蓋"
          destructive
          onCancel={() => {
            setReloadMarkdown(null);
            setSourceMode(true);
          }}
          onConfirm={applyReloadFromFile}
        />
      )}
    </article>
  );
}
