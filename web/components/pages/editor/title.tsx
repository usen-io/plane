import { useState } from "react";
import { observer } from "mobx-react";
// editor
import { EditorRefApi } from "@plane/document-editor";
// ui
import { TextArea } from "@plane/ui";
// helpers
import { cn } from "@/helpers/common.helper";

type Props = {
  editorRef: React.RefObject<EditorRefApi>;
  readOnly: boolean;
  title: string;
  updateTitle: (title: string) => void;
};

export const PageEditorTitle: React.FC<Props> = observer((props) => {
  const { editorRef, readOnly, title, updateTitle } = props;
  // states
  const [isLengthVisible, setIsLengthVisible] = useState(false);

  return (
    <>
      {readOnly ? (
        <h6
          className="break-words bg-transparent text-[1.75rem] font-semibold"
          style={{
            lineHeight: "1.2",
          }}
        >
          {title}
        </h6>
      ) : (
        <>
          <TextArea
            className="w-full bg-custom-background text-[1.75rem] font-semibold outline-none p-0 border-none resize-none rounded-none"
            style={{
              lineHeight: "1.2",
            }}
            placeholder="Untitled"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editorRef.current?.setFocusAtPosition(0);
              }
            }}
            value={title}
            onChange={(e) => updateTitle(e.target.value)}
            maxLength={255}
            onFocus={() => setIsLengthVisible(true)}
            onBlur={() => setIsLengthVisible(false)}
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-1 right-1 z-[2] rounded bg-custom-background-100 p-0.5 text-xs text-custom-text-200 opacity-0 transition-opacity",
              {
                "opacity-100": isLengthVisible,
              }
            )}
          >
            <span
              className={cn({
                "text-red-500": title.length > 255,
              })}
            >
              {title.length}
            </span>
            /255
          </div>
        </>
      )}
    </>
  );
});
