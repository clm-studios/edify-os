'use client';

import { useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { PermissionsInfo } from './PermissionsInfo';
import type React from 'react';

type ModalState = 'idle' | 'pending' | 'success' | 'error';

/** Accepts either a Lucide icon or a react-icons component */
export type AnyIcon = React.ComponentType<{ className?: string; size?: number | string }>;

interface ConfigField {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  required: boolean;
}

interface ApiKeyModalProps {
  integrationId: string;
  serviceName: string;
  serviceIcon: AnyIcon;
  iconBg: string;
  iconText: string;
  configFields: ConfigField[];
  /** Server route that accepts the key fields as POST body JSON */
  connectEndpoint: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Minimal API-key entry modal. Mirrors the structure and markup of OAuthModal
 * but replaces the popup-flow with a direct POST to a connect endpoint.
 *
 * For password fields, a show/hide toggle is added for usability.
 */
export function ApiKeyModal({
  integrationId,
  serviceName,
  serviceIcon: Icon,
  iconBg,
  iconText,
  configFields,
  connectEndpoint,
  onClose,
  onSuccess,
}: ApiKeyModalProps) {
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  const requiredFields = configFields.filter((f) => f.required);
  const allFilled = requiredFields.every((f) => (values[f.name] ?? '').trim() !== '');

  function setFieldValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function toggleShow(name: string) {
    setShowPassword((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function handleConnect() {
    if (!allFilled) return;
    setState('pending');
    setErrorMessage('');

    try {
      const res = await fetch(connectEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Connection failed. Please try again.');
      }

      setState('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  function handleRetry() {
    setState('idle');
    setErrorMessage('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== 'pending') onClose();
      }}
    >
      <div className="card-elevated w-full max-w-md animate-slide-up">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconText}`} />
              </span>
              <div>
                <h2 className="heading-3">Connect {serviceName}</h2>
                <p className="text-xs text-[var(--fg-3)] mt-0.5">
                  Enter your API key to give your team access
                </p>
              </div>
            </div>
            {state !== 'pending' && (
              <button onClick={onClose} className="btn-ghost p-1.5">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Content by state */}
          {state === 'idle' && (
            <>
              <PermissionsInfo integrationId={integrationId} serviceName={serviceName} />

              <div className="mt-5 space-y-4">
                {configFields.map((field) => (
                  <div key={field.name}>
                    <label className="label mb-1 block text-sm">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={field.type === 'password' && showPassword[field.name] ? 'text' : field.type}
                        placeholder={field.placeholder}
                        value={values[field.name] ?? ''}
                        onChange={(e) => setFieldValue(field.name, e.target.value)}
                        className="input-field w-full pr-10"
                        autoComplete="off"
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => toggleShow(field.name)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-4)] hover:text-[var(--fg-2)]"
                          tabIndex={-1}
                        >
                          {showPassword[field.name] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleConnect}
                disabled={!allFilled}
                className="btn-primary mt-5 w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save &amp; Connect
              </button>
              <p className="mt-3 text-center text-xs text-[var(--fg-4)]">
                Your key is encrypted at rest. You can disconnect at any time.
              </p>
            </>
          )}

          {state === 'pending' && (
            <div className="py-8 text-center">
              <div className="flex justify-center mb-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
              </div>
              <p className="font-medium text-[var(--fg-1)]">Connecting to {serviceName}...</p>
              <p className="mt-1 text-sm text-[var(--fg-3)]">
                Validating your API key with {serviceName}.
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="py-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
              </div>
              <p className="font-semibold text-[var(--fg-1)]">{serviceName} connected!</p>
              <p className="mt-1 text-sm text-[var(--fg-3)]">
                Your team now has access to work with your {serviceName} account.
              </p>
            </div>
          )}

          {state === 'error' && (
            <>
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Connection failed</p>
                    <p className="mt-0.5 text-sm text-red-600">{errorMessage}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button onClick={handleRetry} className="btn-primary flex-1">
                  Try Again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
