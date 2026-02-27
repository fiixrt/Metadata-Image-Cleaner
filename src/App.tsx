import { useState, useRef, useEffect } from 'react';
import { Upload, Download, X, Github, Trash2, RotateCcw, RotateCw, Clipboard, FileJson } from 'lucide-react';
import exifr from 'exifr';

interface ExifData {
  [key: string]: any;
}

interface HistoryState {
  originalImage: string | null;
  originalFileName: string;
  metadata: ExifData | null;
  processedImage: string | null;
}

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const [metadata, setMetadata] = useState<ExifData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [futureHistory, setFutureHistory] = useState<HistoryState[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            if (originalImage || processedImage) {
              saveToHistory();
              handleReset();
              showNotification('Image replaced! Use Ctrl+Z to undo');
              setTimeout(() => handleImageFile(file), 0);
            } else {
              handleImageFile(file);
            }
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (originalImage || processedImage) {
          saveToHistory();
          handleReset();
          showNotification('Image deleted');
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [originalImage, processedImage, history]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      if (originalImage || processedImage) {
        handleReset();
        setTimeout(() => handleImageFile(files[0]), 0);
      } else {
        handleImageFile(files[0]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFile(files[0]);
    }
  };

  const extractMetadata = async (file: File): Promise<ExifData> => {
    const metadata: ExifData = {
      'File Info': {
        'File Name': file.name,
        'File Size': `${(file.size / 1024).toFixed(2)} KB`,
        'File Type': file.type,
        'Last Modified': new Date(file.lastModified).toLocaleString(),
      }
    };

    try {
      const allMetadata = await exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        iptc: true,
        icc: true,
        jfif: true,
        ihdr: true,
        xmp: true,
        ifd0: true,
        ifd1: true,
        interop: true,
        makerNote: true,
        userComment: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        sanitize: false,
        mergeOutput: false,
      });

      if (allMetadata) {
        if (allMetadata.ifd0) metadata['IFD0'] = allMetadata.ifd0;
        if (allMetadata.ifd1) metadata['IFD1'] = allMetadata.ifd1;
        if (allMetadata.exif) metadata['EXIF'] = allMetadata.exif;
        if (allMetadata.gps) metadata['GPS'] = allMetadata.gps;
        if (allMetadata.iptc) metadata['IPTC'] = allMetadata.iptc;
        if (allMetadata.icc) metadata['ICC Profile'] = allMetadata.icc;
        if (allMetadata.jfif) metadata['JFIF'] = allMetadata.jfif;
        if (allMetadata.ihdr) metadata['PNG IHDR'] = allMetadata.ihdr;
        if (allMetadata.xmp) metadata['XMP'] = allMetadata.xmp;
        if (allMetadata.tiff) metadata['TIFF'] = allMetadata.tiff;
        if (allMetadata.interop) metadata['Interoperability'] = allMetadata.interop;
        if (allMetadata.makerNote) metadata['Maker Note'] = allMetadata.makerNote;
      }

      const thumbnail = await exifr.thumbnail(file);
      if (thumbnail) {
        metadata['Embedded Thumbnail'] = {
          'Has Thumbnail': true,
          'Size': `${thumbnail.byteLength} bytes`,
        };
      }
    } catch (error) {
      metadata['Extraction Error'] = String(error);
    }

    return metadata;
  };

  const handleImageFile = async (file: File) => {
    setIsProcessing(true);
    setProcessedImage(null);
    setOriginalFileName(file.name);

    const exifData = await extractMetadata(file);
    setMetadata(exifData);

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setOriginalImage(imageUrl);
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCleanMetadata = () => {
    if (!originalImage) return;

    saveToHistory();
    setIsProcessing(true);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setProcessedImage(url);
            setIsProcessing(false);
            showNotification('Metadata removed successfully');
          }
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      setIsProcessing(false);
      showNotification('Error processing image');
    };
    img.src = originalImage;
  };

  const handleDownload = () => {
    if (!processedImage) return;

    const link = document.createElement('a');
    const fileName = originalFileName.replace(/\.[^/.]+$/, '') + '_clean.jpg';
    link.href = processedImage;
    link.download = fileName;
    link.click();
  };

  const handleDownloadOriginal = () => {
    if (!originalImage) return;

    const link = document.createElement('a');
    link.href = originalImage;
    link.download = originalFileName;
    link.click();
  };

  const saveToHistory = () => {
    setHistory([...history, {
      originalImage,
      originalFileName,
      metadata,
      processedImage,
    }]);
    setFutureHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;

    const newHistory = [...history];
    const previousState = newHistory.pop();

    setFutureHistory([{
      originalImage,
      originalFileName,
      metadata,
      processedImage,
    }, ...futureHistory]);

    if (previousState) {
      setOriginalImage(previousState.originalImage);
      setOriginalFileName(previousState.originalFileName);
      setMetadata(previousState.metadata);
      setProcessedImage(previousState.processedImage);
      setHistory(newHistory);
    }
  };

  const handleRedo = () => {
    if (futureHistory.length === 0) return;

    const newFutureHistory = [...futureHistory];
    const nextState = newFutureHistory.shift();

    setHistory([...history, {
      originalImage,
      originalFileName,
      metadata,
      processedImage,
    }]);

    if (nextState) {
      setOriginalImage(nextState.originalImage);
      setOriginalFileName(nextState.originalFileName);
      setMetadata(nextState.metadata);
      setProcessedImage(nextState.processedImage);
      setFutureHistory(newFutureHistory);
    }
  };

  const handleReset = () => {
    setProcessedImage(null);
    setOriginalImage(null);
    setOriginalFileName('');
    setMetadata(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="min-h-screen text-gray-100 flex flex-col"
      style={{ backgroundColor: '#121212' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
          if (originalImage || processedImage) {
            saveToHistory();
            handleReset();
            showNotification('Image replaced! Use Ctrl+Z to undo');
            setTimeout(() => handleImageFile(files[0]), 0);
          } else {
            handleImageFile(files[0]);
          }
        }
      }}
    >
      <header className="py-6 px-4 sm:py-8 sm:px-6 border-b border-gray-800">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-2">
            Metadata Image Cleaner
          </h1>
          <p className="text-gray-400 text-sm">
            Remove metadata from images. All processing happens locally.
          </p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-6xl">
          {!originalImage && !processedImage && !isProcessing && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-8 sm:p-16
                transition-all duration-200 cursor-pointer
                ${
                  isDragging
                    ? 'border-gray-500 bg-gray-900/50'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-900/30 hover:bg-gray-900/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-6">
                <div className="p-6 rounded-full bg-gray-800">
                  <Upload className="w-12 h-12 text-gray-400" />
                </div>

                <div className="text-center">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-3 text-gray-100">
                    Drop your image here
                  </h2>
                  <p className="text-gray-400 mb-4 text-sm sm:text-base">
                    or click to browse files, or press <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">Ctrl+V</kbd> to paste
                  </p>
                </div>
              </div>
            </div>
          )}

          {isProcessing && !originalImage && (
            <div className="flex flex-col items-center gap-6 py-16">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-gray-700 rounded-full"></div>
                <div className="absolute top-0 left-0 w-24 h-24 border-4 border-gray-400 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2 text-gray-100">Loading image...</h2>
                <p className="text-gray-400">Reading metadata</p>
              </div>
            </div>
          )}

          {originalImage && !processedImage && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-100">Image Loaded</h3>
                    <p className="text-sm text-gray-400 truncate">
                      {originalFileName}
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="bg-gray-950 rounded-lg p-4 mb-6">
                  <img
                    src={originalImage}
                    alt="Original preview"
                    className="max-w-full max-h-96 mx-auto rounded-lg"
                  />
                </div>

                <div className="space-y-4">
                  {metadata && (
                    <button
                      onClick={() => setShowJsonModal(true)}
                      className="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <FileJson className="w-5 h-5" />
                      View All Metadata (JSON)
                    </button>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={handleDownloadOriginal}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Download className="w-5 h-5" />
                      <span className="hidden sm:inline">Download Original</span>
                      <span className="sm:hidden">Download</span>
                    </button>
                    <button
                      onClick={handleCleanMetadata}
                      disabled={isProcessing}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span className="hidden sm:inline">Cleaning...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-5 h-5" />
                          <span className="hidden sm:inline">Remove All Metadata</span>
                          <span className="sm:hidden">Clean</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {processedImage && !isProcessing && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-100">Image Cleaned</h3>
                    <p className="text-sm text-gray-400">
                      All metadata has been removed
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="bg-gray-950 rounded-lg p-4 mb-6">
                  <img
                    src={processedImage}
                    alt="Cleaned preview"
                    className="max-w-full max-h-96 mx-auto rounded-lg"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleDownload}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-4 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download Clean Image
                  </button>
                  <button
                    onClick={handleReset}
                    className="sm:flex-none bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-4 px-6 rounded-lg transition-colors"
                  >
                    Process Another
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-6 px-4 sm:px-6 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <a
            href="https://github.com/fiixrt/Metadata-Image-Cleaner"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors text-sm"
            title="View source code on GitHub"
          >
            <Github className="w-4 h-4" />
            <span>Source</span>
          </a>
          <p className="text-center text-xs sm:text-sm text-gray-500 flex-1">
            No uploads. No tracking. No storage.
          </p>
        </div>
      </footer>

      {notification && (
        <div className="fixed top-6 right-6 z-50 bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-top-2 fade-in">
          <p className="text-sm font-medium">{notification}</p>
        </div>
      )}

      {showJsonModal && metadata && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowJsonModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-gray-100">Image Metadata (JSON)</h3>
              <button
                onClick={() => setShowJsonModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-8rem)]">
              <pre className="bg-gray-950 p-4 rounded-lg text-sm text-gray-200 overflow-x-auto font-mono">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
                  showNotification('Metadata copied to clipboard');
                }}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <Clipboard className="w-4 h-4" />
                Copy JSON
              </button>
              <button
                onClick={() => setShowJsonModal(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 bg-gray-900/95 backdrop-blur border border-gray-800 text-gray-200 px-4 py-3 rounded-lg shadow-lg max-w-xs sm:max-w-none">
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Clipboard className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">Ctrl+V</kbd> Paste</span>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">Ctrl+Z</kbd> Undo</span>
          </div>
          <div className="flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">Ctrl+Y</kbd> Redo</span>
          </div>
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">Ctrl+D</kbd> Delete</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
