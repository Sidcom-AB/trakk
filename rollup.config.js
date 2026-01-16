import terser from '@rollup/plugin-terser';

export default [
  // UMD build (for script tags)
  {
    input: 'src/timeline-editor.js',
    output: {
      file: 'dist/timeline.js',
      format: 'umd',
      name: 'TimelineEditor',
      sourcemap: true
    },
    plugins: [
      terser({
        format: {
          comments: false
        }
      })
    ]
  },
  // ESM build (for bundlers)
  {
    input: 'src/timeline-editor.js',
    output: {
      file: 'dist/timeline.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      terser({
        format: {
          comments: false
        }
      })
    ]
  }
];
