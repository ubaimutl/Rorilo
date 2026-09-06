import { describe, expect, it } from 'vitest';
import { extractCvLocally } from '@/lib/cv/parser';

const sampleCv = `ALEX
Frontend Developer with practical experience
in React, JavaScript, Next.js
and WordPress. Focus on clean user inter-
faces, debugging,
testing and pragmatic delivery of web projects.
Additional experience with
Python/Django and AI-assisted development
with modern developer tools.
RIVERA
Frontend Developer
MAIL
WORK EXPERIENCE
alex.rivera@example.test
TELEFON
+1 555 010 1000
ORTSample City, 12345
WEBhttps://alex-rivera.example
https://github.com/alex-rivera-example
SKILLS
▪ JavaScript/TypeScript
▪ React/Next.js
▪ HTML/CSS/Tailwind/Shadcn UI
▪ Linux/Docker
▪ MySQL/PostgreSQL
Example Studio LLC
2022 - present
Web Developer
Sample City
Development and maintenance of websites, landing pages and web
interfaces
Implementation of frontend features with JavaScript, React,
Next.js and WordPress
Testing, debugging, performance improvements and technical
optimization
Work with Git, deployments and independent project organization
Northwind Data LLC
2020 - 2022
Data Entry Clerk
Sample City
Returns management and structured data entry
▪ Wordpress/MedusaJs/PayloadCMS
▪ Github/Dokploy/Cpanel/DirectAd-
min/Cloudflare
LANGUAGES
▪ English (C1)
▪ German (B1)
EDUCATION
Professional training in software
development
2024
Software Development - Example Training Center
Focus areas: programming, web development, databases,
project work and software development`;

describe('extractCvLocally', () => {
  it('extracts meaningful CV sections when AI output is thin', () => {
    const parsed = extractCvLocally(sampleCv);

    expect(parsed.firstName).toBe('ALEX');
    expect(parsed.lastName).toBe('RIVERA');
    expect(parsed.email).toBe('alex.rivera@example.test');
    expect(parsed.city).toBe('Sample City');
    expect(parsed.gitHub).toBe('https://github.com/alex-rivera-example');
    expect(parsed.portfolio).toBe('https://alex-rivera.example');
    expect(parsed.languages).toEqual(['Englisch (C1)', 'Deutsch (B1)']);
    expect(parsed.technologies).toEqual(
      expect.arrayContaining(['JavaScript', 'TypeScript', 'React', 'Next.js', 'WordPress', 'Docker', 'MySQL', 'PostgreSQL'])
    );
    expect(parsed.skills).toEqual(expect.arrayContaining(['Frontend development', 'Testing', 'Debugging', 'Web development']));
    expect(parsed.workExperience).toHaveLength(2);
    expect(parsed.workExperience[0]).toMatchObject({
      company: 'Example Studio LLC',
      startDate: '2022 - present',
      role: 'Web Developer',
    });
    expect(parsed.workExperience[1]).toMatchObject({
      company: 'Northwind Data LLC',
      startDate: '2020 - 2022',
      role: 'Data Entry Clerk',
    });
    expect(parsed.projects.length).toBeGreaterThanOrEqual(1);
    expect(parsed.education.length).toBeGreaterThanOrEqual(1);
  });
});
