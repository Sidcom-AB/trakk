import terser from '@rollup/plugin-terser';

export default [
  // UMD build (for script tags)
  {
    input: 'src/trakk.js',
    output: {
      file: 'dist/trakk.js',
      format: 'umd',
      name: 'Trakk',
      sourcemap: false
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
    input: 'src/trakk.js',
    output: {
      file: 'dist/trakk.esm.js',
      format: 'esm',
      sourcemap: false
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
