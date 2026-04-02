import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { transferTextStyle } from "@/lib/text-transfer-client";
import { SUPPORTED_RATIOS, DEFAULT_RATIO, type SupportedRatio } from "@/lib/text-transfer-contract";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB base64 length guard

type UploadedImage = {
  dataUrl: string;
  name: string;
};

function ImageUploadZone({
  label,
  sublabel,
  image,
  onUpload,
  disabled,
}: {
  label: string;
  sublabel: string;
  image: UploadedImage | null;
  onUpload: (img: UploadedImage) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("不支持该文件格式，请上传图片文件");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) {
          toast.error("图片过大（超过 3MB），请压缩后重试");
          return;
        }
        onUpload({ dataUrl, name: file.name });
      };
      reader.readAsDataURL(file);
    },
    [onUpload]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`上传${label}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex min-h-[200px] cursor-pointer select-none flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
          image ? "border-gold/60 bg-gold/5" : "border-gold/30 bg-muted/30 hover:border-gold/50",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        {image ? (
          <img
            src={image.dataUrl}
            alt={label}
            className="max-h-[240px] w-full rounded-xl object-contain p-1"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{label}</span>
            <span className="text-xs text-muted-foreground">{sublabel}</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleChange}
          disabled={disabled}
          aria-hidden="true"
        />
      </div>
      {image && <p className="mt-1 truncate text-xs text-muted-foreground">{image.name}</p>}
    </div>
  );
}

export function TextTransferWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [refImage, setRefImage] = useState<UploadedImage | null>(null);
  const [targetImage, setTargetImage] = useState<UploadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<SupportedRatio>(DEFAULT_RATIO);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  const canSubmit = !!refImage && !!targetImage && !!prompt.trim() && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setResultUrl(null);

    try {
      const response = await transferTextStyle({
        refImage: refImage!.dataUrl,
        targetImage: targetImage!.dataUrl,
        prompt: prompt.trim(),
        ratio,
      });

      if (response.success) {
        setResultUrl(response.image_data_url);
        setTimeout(() => {
          document.getElementById("text-transfer-result")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        toast.error(response.error || "生成失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "text-transfer-result.png";
    a.click();
  };

  const loadingLabel =
    elapsed >= 90
      ? `生成中... 已等待 ${elapsed}s（生成时间较长，请耐心等待）`
      : `生成中... 已等待 ${elapsed}s`;

  const content = (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <Sparkles className="h-4 w-4" />
          模拟 Claude Code 调用 `aifast-text-transfer-editor`
        </div>
        <h1 className={cn("mt-2 font-display font-bold text-foreground", embedded ? "text-3xl" : "text-2xl")}>
          参考图样式迁移到目标图
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传一张参考图、一张要更改的图，再写一句 prompt，系统会按本地 skill 的方式组装指令并生成更改后的结果图。
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <ImageUploadZone
          label="参考图"
          sublabel="文字风格来源"
          image={refImage}
          onUpload={setRefImage}
          disabled={loading}
        />
        <ImageUploadZone
          label="待更改图"
          sublabel="会被保留主体和背景"
          image={targetImage}
          onUpload={setTargetImage}
          disabled={loading}
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Prompt 会直接参与 skill 调用</p>
            <p className="text-sm text-muted-foreground">
              例：把第一张图的文字风格迁移到第二张图，把 “Day 01” 改成 “Day 05”，其余构图和背景尽量保持不变。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-prompt">
          Prompt <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="transfer-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想怎么改图上的文字、样式和位置，例如：保留第二张图的背景和人物，把第一张图上的标题样式迁移过来，并把文案改成 Day 05。"
          rows={5}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label>宽高比</Label>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRatio(r)}
              disabled={loading}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                ratio === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                loading && "pointer-events-none opacity-60"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full gradient-ink text-primary-foreground"
        aria-busy={loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingLabel}
          </span>
        ) : (
          "更改图片"
        )}
      </Button>

      {resultUrl && (
        <div id="text-transfer-result" className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-foreground">生成结果</h2>
          <img
            src={resultUrl}
            alt="文字迁移结果图"
            className="w-full rounded-xl border border-border"
          />
          <Button variant="outline" onClick={handleDownload} className="w-full gap-2">
            <Download className="h-4 w-4" />
            下载图片
          </Button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return <div className="container max-w-3xl py-8">{content}</div>;
}

export default function TextTransferPage() {
  return <TextTransferWorkspace />;
}
