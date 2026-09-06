'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';

interface SecretInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Decoy field name so password managers don't recognize the input. */
  fieldName?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Password-style input hardened against browser and password-manager autofill:
 * neutral field name, `new-password` autocomplete, manager opt-outs, and
 * read-only-until-focus so autofill never silently replaces a saved key.
 */
export function SecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  fieldName,
  className,
  inputClassName,
}: SecretInputProps) {
  const generatedId = useId();
  const inputId = id || `secret-${generatedId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const locked = !unlocked && value === '';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          name={fieldName || `rorilo-field-${generatedId.replace(/[^a-zA-Z0-9]/g, '')}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setUnlocked(true)}
          onBlur={() => {
            if (!value) setUnlocked(false);
          }}
          readOnly={locked}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          placeholder={placeholder}
          className={cn('font-mono text-xs h-9 pr-9', inputClassName)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
          tabIndex={-1}
          aria-label={visible ? t('common.hide', { label }) : t('common.show', { label })}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
