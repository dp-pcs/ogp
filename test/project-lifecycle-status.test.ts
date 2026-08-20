import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addProject,
  createProject,
  getProject,
  setProjectStatus,
  type Project
} from '../src/daemon/projects.js';

describe('setProjectStatus', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-lifecycle-'));
    process.env.OGP_HOME = tempDir;
    addProject(createProject('proj', 'Proj'));
  });
  afterEach(() => { delete process.env.OGP_HOME; fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('marks a project archived with a reason', () => {
    expect(setProjectStatus('proj', 'archived', 'test project, ignore')).toBe(true);
    const project = getProject('proj') as Project;
    expect(project.status).toBe('archived');
    expect(project.statusReason).toBe('test project, ignore');
  });

  it('archives without a reason (statusReason absent)', () => {
    setProjectStatus('proj', 'archived');
    const project = getProject('proj') as Project;
    expect(project.status).toBe('archived');
    expect(project.statusReason).toBeUndefined();
  });

  it('reactivating clears status and statusReason', () => {
    setProjectStatus('proj', 'archived', 'done');
    setProjectStatus('proj', 'active');
    const project = getProject('proj') as Project;
    expect(project.status).toBeUndefined();
    expect(project.statusReason).toBeUndefined();
  });

  it('bumps updatedAt', () => {
    const before = (getProject('proj') as Project).updatedAt;
    setProjectStatus('proj', 'archived', 'x');
    const after = (getProject('proj') as Project).updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('returns false for an unknown project', () => {
    expect(setProjectStatus('nope', 'archived')).toBe(false);
  });

  it('new projects default to active (status field absent)', () => {
    const project = getProject('proj') as Project;
    expect(project.status).toBeUndefined();
  });
});
