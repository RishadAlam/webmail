import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Undo2, Redo2 } from 'lucide-react';
import { IconButton } from './ui';
export default function Editor({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
}) {
    const editor = useEditor({
        extensions: [StarterKit.configure({ link: { openOnClick: false } })],
        content: value,
        editable: !disabled,
        editorProps: {
            attributes: {
                role: 'textbox',
                'aria-label': 'Message body',
                'aria-multiline': 'true',
                class: 'mail-editor',
            },
        },
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });
    useEffect(() => {
        editor?.setEditable(!disabled);
    }, [editor, disabled]);
    return (
        <>
            <div className="editor-scroll">
                <EditorContent editor={editor} />
            </div>
            <div className="formatting" aria-label="Formatting">
                <IconButton
                    icon={Bold}
                    label="Bold"
                    disabled={disabled}
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    aria-pressed={editor?.isActive('bold')}
                />
                <IconButton
                    icon={Italic}
                    label="Italic"
                    disabled={disabled}
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    aria-pressed={editor?.isActive('italic')}
                />
                <span className="toolbar-divider" />
                <IconButton
                    icon={List}
                    disabled={disabled}
                    label="Bullet list"
                    onClick={() =>
                        editor?.chain().focus().toggleBulletList().run()
                    }
                />
                <IconButton
                    icon={ListOrdered}
                    disabled={disabled}
                    label="Numbered list"
                    onClick={() =>
                        editor?.chain().focus().toggleOrderedList().run()
                    }
                />
                <span className="toolbar-divider" />
                <IconButton
                    icon={Undo2}
                    label="Undo typing"
                    disabled={disabled}
                    onClick={() => editor?.chain().focus().undo().run()}
                />
                <IconButton
                    icon={Redo2}
                    label="Redo typing"
                    disabled={disabled}
                    onClick={() => editor?.chain().focus().redo().run()}
                />
            </div>
        </>
    );
}
