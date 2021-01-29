const { exists, MockUI } = require('../test-helper');
const { join, resolve } = require('path');
const { mkdir, writeFile } = require('fs/promises');
const rmdir = require('del');
const subject = require('../../index');
const test = require('ava');

function mockFetch(assert) {
  return async function(url, { body, headers, method }) {
    assert.context.fetches.push({ url, body, headers, method });

    if (assert.context.forceFetchError === true) {
      throw new Error('')
    }

    return { url, body, headers, method };
  }
}

test.beforeEach(async assert => {
  assert.context.fetches = [];

  assert.context.forceFetchError = false;

  assert.context.plugin = subject.createDeployPlugin({
    name: 'rollbar',
    fetch: mockFetch(assert),
  });

  assert.context.context = {
    distDir: 'tmp/test-dist',
    distFiles: [
      'assets/foo.js',
      'assets/foo.map',
      'assets/bar.js.gz',
      'assets/bar.map.gz',
      'index.html',
    ],
    ui: new MockUI(),
    project: {
      root: process.cwd(),
      pkg: {
        version: '1.2.3',
      },
      name() {
        return 'test-project';
      },
    },
    config: {
      rollbar: {
        accessServerToken: '123',
        minifiedRootURL: 'https://foo.com/',
      },
    },
  };

  if (!await exists('tmp')) {
    await mkdir('tmp');
  }

  if (!await exists(assert.context.context.distDir)) {
    await mkdir(assert.context.context.distDir);
  }

  if (!await exists(join(assert.context.context.distDir, 'assets'))) {
    await mkdir(join(assert.context.context.distDir, 'assets'));
  }

  for (const distFile of assert.context.context.distFiles) {
    await writeFile(join(assert.context.context.distDir, distFile),
      `distFile(${distFile})`, 'utf8');
  }

  assert.context.plugin.beforeHook(assert.context.context);
  assert.context.plugin.configure(assert.context.context);
});

test.afterEach(async assert => {
  await rmdir(assert.context.context.distDir);
});

test.serial('includedFiles', async assert => {
  const config = assert.context.context.config.rollbar;
  const distFiles = assert.context.context.distFiles;
  const plugin = assert.context.plugin;
  const { filePattern, fileIgnorePattern } = config;

  const includedFiles = plugin.includedFiles(
    distFiles,
    filePattern,
    fileIgnorePattern,
  );

  assert.deepEqual(
    includedFiles,
    [
      'assets/foo.js',
      'assets/foo.map',
    ],
  );
});

test.serial('includedFilePairs', async assert => {
  const config = assert.context.context.config.rollbar;
  const distFiles = assert.context.context.distFiles;
  const plugin = assert.context.plugin;
  const { filePattern, fileIgnorePattern } = config;

  const includedFiles = plugin.includedFiles(
    distFiles,
    filePattern,
    fileIgnorePattern,
  );

  const includedFilePairs = plugin.includedFilePairs(includedFiles);

  assert.deepEqual(
    includedFilePairs,
    [
      [
        'assets/foo.map',
        'assets/foo.js',
      ],
    ],
  );
});

test.serial('didActivate', async assert => {
  const context = assert.context;
  const plugin = context.plugin;

  await plugin.didActivate(context.context);

  assert.deepEqual(
    assert.context.fetches,
    [
      {
        body: '{"version":"1.2.3","minified_url":"https://foo.com/assets/foo.js","source_map":"distFile(assets/foo.map)"}',
        headers: { 'X-Rollbar-Access-Token': '123' },
        method: 'POST',
        url: 'https://api.rollbar.com/api/1/sourcemap',
      },
    ],
  );
});
