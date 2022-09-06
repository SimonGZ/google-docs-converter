module.exports = {
    'env': {
        'browser': true,
        'commonjs': true,
        'es6': true,
    },
    'extends': [
    ],
    'globals': {
        'Atomics': 'readonly',
        'SharedArrayBuffer': 'readonly',
    },
    'parser': '@typescript-eslint/parser',
    'parserOptions': {
        'ecmaVersion': 2018,
    },
    'plugins': [
        '@typescript-eslint',
    ],
    'rules': {
        'object-curly-spacing': [2, 'always'],
    },
};
