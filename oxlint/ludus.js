const maxProps = 5;
const nestedFunction = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function hasDirectJsx(fn) {
  const seen = new Set();
  const stack = [fn.body];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
      return true;
    }
    if (nestedFunction.has(current.type)) {
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent' || key === 'loc' || key === 'range') {
        continue;
      }
      const value = current[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return false;
}

function typeName(annotation) {
  if (!annotation || annotation.type !== 'TSTypeReference') {
    return null;
  }
  let name = annotation.typeName;
  while (name?.type === 'TSQualifiedName') {
    name = name.left;
  }
  return name?.type === 'Identifier' ? name.name : null;
}

function annotationOf(param) {
  if (param.type === 'AssignmentPattern') {
    return param.typeAnnotation?.typeAnnotation ?? annotationOf(param.left);
  }
  return param.typeAnnotation?.typeAnnotation ?? null;
}

function patternOf(param) {
  return param.type === 'AssignmentPattern' ? param.left : param;
}

function destructuredCount(param) {
  const pattern = patternOf(param);
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  return pattern.properties.filter((property) => property.type !== 'RestElement').length;
}

function interfaceKeyCount(declaration) {
  return declaration.body.body.filter(
    (member) => member.type === 'TSPropertySignature' || member.type === 'TSMethodSignature',
  ).length;
}

function isHook(name) {
  return /^use[A-Z0-9]/.test(name);
}

const componentApi = {
  create(context) {
    /** @type {Map<string, import('estree').Node>} */
    const interfaces = new Map();
    /** @type {Set<string>} */
    const imported = new Set();

    function check(fn) {
      const name = fn.id?.name;
      if (!name || isHook(name) || !hasDirectJsx(fn)) {
        return;
      }
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
        context.report({ message: `Component ${name} must be PascalCase.`, node: fn.id });
      }
      if (fn.params.length > 1) {
        context.report({
          message: 'Pass ref as a prop. Components take one props argument.',
          node: fn.params[1],
        });
      }
      if (fn.params.length === 0) {
        return;
      }
      const param = fn.params[0];
      const annotation = annotationOf(param);
      const expected = `${name}Props`;
      if (!annotation || annotation.type === 'TSTypeLiteral') {
        context.report({
          message: `Declare interface ${expected} separate from the component.`,
          node: param,
        });
        return;
      }
      if (annotation.type !== 'TSTypeReference') {
        context.report({
          message: `Declare interface ${expected} separate from the component, or use an imported props type.`,
          node: param,
        });
        return;
      }
      const propsName = typeName(annotation);
      const localInterface = propsName ? interfaces.get(propsName) : undefined;
      if (!imported.has(propsName) && !localInterface) {
        context.report({
          message: `Declare interface ${expected} separate from the component, or use an imported props type.`,
          node: param,
        });
        return;
      }
      if (localInterface) {
        if (propsName !== expected) {
          context.report({ message: `Name the props interface ${expected}.`, node: param });
        }
        if (localInterface.extends?.length) {
          context.report({
            message: `List every prop on interface ${expected}.`,
            node: localInterface,
          });
        }
        const count = interfaceKeyCount(localInterface);
        if (count > maxProps) {
          context.report({
            message: `Component ${name} has ${count} props. The limit is ${maxProps}.`,
            node: localInterface,
          });
        }
        return;
      }
      const count = destructuredCount(param);
      if (count === null) {
        context.report({
          message:
            'Destructure imported props in the parameter list. Rest does not count towards the limit of 5.',
          node: param,
        });
        return;
      }
      if (count > maxProps) {
        context.report({
          message: `Component ${name} has ${count} props. The limit is ${maxProps}.`,
          node: param,
        });
      }
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression(node) {
        if (node.id) {
          check(node);
        }
      },
      Program(node) {
        for (const statement of node.body) {
          const declaration =
            statement.type === 'ExportNamedDeclaration' ||
            statement.type === 'ExportDefaultDeclaration'
              ? statement.declaration
              : statement;
          if (declaration?.type === 'TSInterfaceDeclaration') {
            interfaces.set(declaration.id.name, declaration);
          }
          if (statement.type !== 'ImportDeclaration') {
            continue;
          }
          for (const specifier of statement.specifiers) {
            imported.add(specifier.local.name);
          }
        }
      },
    };
  },
};

const noForwardRef = {
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                !callee.computed &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name === 'forwardRef') {
          context.report({ node, message: 'forwardRef is deprecated. Take ref as a prop.' });
        }
      },
      ImportSpecifier(node) {
        if (node.imported.type === 'Identifier' && node.imported.name === 'forwardRef') {
          context.report({ node, message: 'forwardRef is deprecated. Take ref as a prop.' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'ludus' },
  rules: {
    'component-api': componentApi,
    'no-forward-ref': noForwardRef,
  },
};
