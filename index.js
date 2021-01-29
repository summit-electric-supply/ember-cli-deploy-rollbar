'use strict';

const BasePlugin = require('ember-cli-deploy-plugin');
const { basename, extname, resolve } = require('path');
const { readFile } = require('fs/promises');
const minimatch = require('minimatch');
const fetch = require('node-fetch');

module.exports = {
  name: 'ember-cli-deploy-rollbar',

  createDeployPlugin(options) {
    const RollbarPlugin = BasePlugin.extend({
      name: 'rollbar',

      _fetch: options.fetch ?? fetch,

      async fetch(...args) {
        try {
          return await (await this._fetch(...args)).text();
        } catch(error) {
          this.error(error);
          throw error;
        }
      },

      defaultConfig: {
        apiEndpoint: 'https://api.rollbar.com/api/1/sourcemap',
        fileIgnorePattern: null,
        filePattern: '**/*.{js,map}',
        version(context) {
          return context.project.pkg.version;
        },
      },

      requiredConfig: [
        'accessServerToken',
        'minifiedRootURL',
      ],

      info(...messages) {
        this.log(`✔  ${messages.join(' ')}`, { verbose: true });
      },

      error(error) {
        this.log(error, { color: 'red' });
      },

      includedFiles(distFiles, include, ignore) {
        const files = distFiles.filter(minimatch.filter(include, { matchBase: true }));

        if (ignore !== null) {
          return files.filter(minimatch.filter(ignore, { matchBase: true, flipNegate: true }));
        } else {
          return files;
        }
      },

      includedFilePairs(includedFiles) {
        const map = new Map();
        const pairs = [];

        includedFiles.forEach((includedFile, index) => {
          const key = basename(includedFile, extname(includedFile));

          if (!map.has(key)) {
            map.set(key, new Set());
          }

          map.get(key).add(index);
        });

        map.forEach((values) => {
          if (values.size === 2) {
            // should be (map, js)
            let tuple = [null, null];

            values.forEach(index => {
              if (extname(includedFiles[index]) === '.map') {
                tuple[0] = includedFiles[index];
              } else {
                tuple[1] = includedFiles[index];
              }
            });

            pairs.push(tuple);
          }
        });

        return pairs;
      },

      async didActivate(context) {
        const accessServerToken = this.readConfig('accessServerToken');
        const apiEndpoint       = this.readConfig('apiEndpoint');
        const distDir           = context.distDir;
        const distFiles         = context.distFiles;
        const fileIgnorePattern = this.readConfig('fileIgnorePattern');
        const filePattern       = this.readConfig('filePattern');
        const filesUploaded     = context.filesUploaded;
        const minifiedRootURL   = this.readConfig('minifiedRootURL');
        const root              = context.project.root;
        const version           = this.readConfig('version');
        const method            = 'POST';

        const pairs = this.includedFilePairs(this
          .includedFiles(distFiles, filePattern, fileIgnorePattern));

        for (const [map, js] of pairs) {
          try {
            const body = JSON.stringify({
              version,
              minified_url: new URL(js, minifiedRootURL).toString(),
              source_map: (await readFile(resolve(root, distDir, map))).toString(),
            });

            const headers = {
              'X-Rollbar-Access-Token': accessServerToken,
            };

            await this.fetch(apiEndpoint, { body, headers, method });

            this.info(map);
            this.info(js);
          } catch(error) {
            this.error(error);
          }
        }

        this.info(`uploaded ${pairs.length} files`);
      },
    });

    return new RollbarPlugin();
  }
};
