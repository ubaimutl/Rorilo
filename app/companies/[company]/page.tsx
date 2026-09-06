'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Loader2, Building2, BookmarkCheck, FileText, Send, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { JobCard } from '@/components/JobCard';
import { CompanyLogo } from '@/components/CompanyLogo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function CompanyPage() {
  const params = useParams();
  const companyParam = params?.company as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    if (!companyParam) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(decodeURIComponent(companyParam))}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || 'Could not load company.');
        return;
      }
      setData(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyParam]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 py-28 text-sm text-neutral-400">
        <Loader2 className="size-4 animate-spin" />
        Loading company...
      </div>
    );
  }

  if (error || !data?.company) {
    return (
      <div className="flex-1 p-10 text-sm text-neutral-500">
        {error || 'Company not found.'}{' '}
        <Link href="/" className="font-medium text-neutral-900 underline">
          Back to Discover
        </Link>
      </div>
    );
  }

  const company = data.company;
  const stats = [
    { label: 'Jobs', value: company.stats.totalJobs, Icon: Building2 },
    { label: 'Saved', value: company.stats.saved, Icon: BookmarkCheck },
    { label: 'Prepared', value: company.stats.prepared, Icon: FileText },
    { label: 'Applied', value: company.stats.applied, Icon: Send },
    { label: 'Avg score', value: `${company.stats.averageScore}%`, Icon: Gauge },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        back={{ href: '/', label: 'Discover' }}
        title={company.name}
        description={`${company.stats.totalJobs} saved posting${company.stats.totalJobs === 1 ? '' : 's'} from this company`}
        badge={
          <CompanyLogo
            company={company.name}
            website={company.website}
            directLogoUrl={company.logo}
            size={32}
          />
        }
        actions={
          company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:text-neutral-950"
            >
              <span>Website</span>
              <ExternalLink className="size-3.5" />
            </a>
          )
        }
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
        <Card size="sm">
          <CardContent className="flex flex-wrap gap-4">
            {stats.map((stat) => {
              const Icon = stat.Icon;
              return (
                <div key={stat.label} className="flex min-w-32 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-lg font-bold tabular-nums text-neutral-900">{stat.value}</span>
                    <span className="block text-xs text-neutral-500">{stat.label}</span>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {(company.sourceLabels?.length > 0 || company.sourceLinks?.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Source coverage</CardTitle>
              <CardDescription>Useful when the same company appears through several actors or boards.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {company.sourceLabels?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {company.sourceLabels.map((source: string) => (
                    <Badge key={source} variant="outline">{source}</Badge>
                  ))}
                </div>
              )}
              {company.sourceLinks?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {company.sourceLinks.slice(0, 8).map((entry: any, index: number) => (
                    <a
                      key={`${entry.source}-${index}`}
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                    >
                      <span className="truncate">{entry.source}</span>
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-4">
          {data.jobs.map((job: any) => (
            <JobCard
              key={job.id}
              job={job}
              onSaveToggle={fetchCompany}
              onDelete={(jobId) => {
                setData((current: any) => ({
                  ...current,
                  jobs: current.jobs.filter((item: any) => item.id !== jobId),
                }));
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
