
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseUserCsv, ParseResult } from '../utils/csv-parser';

interface CsvUploadProps {
    onUpload: (rows: Record<string, string>[]) => void;
}

export const CsvUpload: React.FC<CsvUploadProps> = ({ onUpload }) => {
    const [parsing, setParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const { t } = useTranslation('bulk');
    const { t: tToast } = useTranslation('toast');

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        setFileName(file.name);
        setParsing(true);
        setError(null);
        setSuccess(null);

        try {
            const result: ParseResult = await parseUserCsv(file);

            if (result.errors.length > 0) {
                setError(tToast('csv.parseError', { error: result.errors[0] }));
                onUpload([]);
            } else if (result.data.length === 0) {
                setError(tToast('csv.emptyOrInvalid'));
                onUpload([]);
            } else {
                setSuccess(tToast('csv.loaded', { count: result.data.length }));
                onUpload(result.data);
            }
        } catch (err: any) {
            setError(tToast('csv.readError', { error: err.message }));
            onUpload([]);
        } finally {
            setParsing(false);
        }
    }, [onUpload, tToast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.csv'],
        },
        maxFiles: 1,
    });

    const clearFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setFileName(null);
        setError(null);
        setSuccess(null);
        onUpload([]);
    };

    return (
        <div className="w-full max-w-xl mx-auto">
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-eth-primary-container/40 bg-eth-primary-container/10' : 'border-outline-variant/30 hover:border-outline-variant/40'}
          ${error ? 'border-eth-danger/30 bg-eth-danger/10' : ''}
          ${success ? 'border-green-300 bg-eth-secondary/10' : ''}
        `}
            >
                <input {...getInputProps()} />

                <div className="flex flex-col items-center justify-center space-y-4">
                    {fileName ? (
                        <div className="relative">
                            <FileSpreadsheet className={`w-12 h-12 ${error ? 'text-eth-danger' : 'text-eth-secondary'}`} />
                            <button
                                onClick={clearFile}
                                className="absolute -top-2 -right-2 bg-surface-container-high rounded-full p-1 hover:bg-surface-container-highest"
                            >
                                <X className="w-4 h-4 text-on-surface-variant" />
                            </button>
                        </div>
                    ) : (
                        <div className="bg-eth-primary-container/15 p-3 rounded-full">
                            <Upload className="w-6 h-6 text-eth-primary" />
                        </div>
                    )}

                    <div>
                        {parsing ? (
                            <p className="text-on-surface-variant">{t('csv.parsing')}</p>
                        ) : error ? (
                            <div className="text-eth-danger flex items-center justify-center space-x-2">
                                <AlertCircle className="w-4 h-4" />
                                <span>{error}</span>
                            </div>
                        ) : success ? (
                            <div className="text-eth-secondary flex items-center justify-center space-x-2">
                                <CheckCircle className="w-4 h-4" />
                                <span>{success}</span>
                                <p className="text-sm text-on-surface-variant mt-1">{fileName}</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-lg font-medium text-on-surface">
                                    {isDragActive ? t('csv.dropzoneActive') : t('csv.dropzonePrompt')}
                                </p>
                                <p className="text-sm text-on-surface-variant mt-1">
                                    {t('csv.dropzoneSubtitle')}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
