import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as prettier from 'prettier'

function listType(s: string): string | null {
  if (s.length > 5 && s.slice(0, 5) == 'list(') {
    return s.slice(5, s.length - 1)
  } else {
    return null
  }
}

export function optionType(s: string): string | null {
  if (s.length > 9 && s.slice(0, 9) == 'optional(') {
    return s.slice(9, s.length - 1)
  } else {
    return null
  }
}

function associatedType(ty: string): string {
  let lt = listType(ty)
  let ot = optionType(ty)
  if (lt) {
    let t = associatedType(lt)
    return `${t}[]`
  } else if (ot) {
    let t = associatedType(ot)
    return `${t} | undefined`
  } else if (ty == 'query') {
    return `Query`
  } else if (ty == 'graph') {
    return 'Graph'
  } else if (ty == 'node') {
    return 'Node'
  } else if (ty == 'value') {
    return 'Value'
  } else if (ty == 'integer') {
    return 'number'
  } else if (ty == 'boolean') {
    return 'boolean'
  } else if (ty == 'json') {
    return 'any'
  } else if (ty == 'resource') {
    return 'string'
  } else if (ty == 'string') {
    return 'string'
  } else if (ty == 'float') {
    return 'number'
  } else if (ty == 'path') {
    return 'PathPattern'
  } else if (ty == 'arithmetic') {
    return 'ArithmeticExpression'
  } else {
    return 'any'
  }
}

function associatedTypes(types: string[]): string[] {
  return types.map((ty) => {
    return associatedType(ty)
  })
}

function lowerCamelCase(inputString: string): string {
  if (inputString.length > 1) {
    return (
      inputString[0].toLowerCase() + inputString.slice(1, inputString.length)
    )
  }
  return inputString.toLowerCase()
}

function renameFunction(inputString: string): string {
  let newName = lowerCamelCase(inputString)
  if (newName == 'eval') {
    return 'compute'
  } else if (newName == 'true') {
    return 'success'
  } else {
    return newName
  }
}

function argsList(fields: string[], types: string[]): string[] {
  let args = []
  for (const i in fields) {
    let name = fields[i]
    let typ = types[i]
    let res = typ.match(/(\S*)\s*\|\s*undefined/)
    if (res != null) {
      args.push(`${name}?: ${res[1]}`)
    } else {
      args.push(`${name}: ${typ}`)
    }
  }
  return args
}

function renderBody(name: string, fields: string[]): string {
  let inner = fields
    .map((s: string): string => {
      return `${s}`
    })
    .join(', ')
  return `{ '@type': '${name}', ${inner} }`
}

function generateDefs(
  jsonObject: any,
  cls: string,
  otherTypes: string[] = [],
): string {
  let defs = ''
  let clsTypeList: string[] = []
  for (const i in jsonObject) {
    if (jsonObject[i]['@metadata'] && jsonObject[i]['@inherits'] == cls) {
      let name = jsonObject[i]['@id']
      let metadata = jsonObject[i]['@metadata']
      let definitionRecord = metadata['https://terminusdb.com']
      let fields = definitionRecord['fields']
      let defTypes = associatedTypes(definitionRecord['types'])
      let funName = renameFunction(name)
      let args = argsList(fields, defTypes)
      let funArgs = args.join(', ')
      let types = args.join('\n  ')
      let body = renderBody(name, fields)
      let fundef = `
export interface ${name} {
'@type': '${name}'
  ${types}
}

export function ${funName}(${funArgs}) : ${name} {
  return ${body}
}
`
      console.log(fundef)
      defs += fundef
      clsTypeList.push(name)
    }
  }
  clsTypeList = clsTypeList.concat(otherTypes)
  let queryType = `
export type ${cls} = ${clsTypeList.join(' | ')}
`
  defs += queryType
  return defs
}

export async function generateWoql(): Promise<void> {
  const dir = dirname(fileURLToPath(import.meta.url))
  const data = await readFile(dir + '/woql_list.json', 'utf8')
  const jsonObject = JSON.parse(data)

  let defs = `
/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/naming-convention */
import { type Graph, type Value, type Node } from './types.js'

`
  const queryDefs = generateDefs(jsonObject, 'Query')
  defs += queryDefs

  const pathDefs = generateDefs(jsonObject, 'PathPattern')
  defs += pathDefs

  const arithmeticDefs = generateDefs(jsonObject, 'ArithmeticExpression', [
    'number',
  ])

  defs += arithmeticDefs

  const pretty = await prettier.format(defs, {
    parser: 'typescript',
    trailingComma: 'all',
    tabWidth: 2,
    semi: false,
    singleQuote: true,
  })
  await writeFile(dir + '/woql.ts', pretty)
}
