import { FinalExecutionOutcome } from 'near-api-js/lib/providers';
import { NearContractAbi, CallOverrides, CallOverridesPayable, NearContractBase } from '@neargen-js/core';
import {
  CallFunctionDefinition,
  FunctionDefinitionBase,
  getCallFunctionDefinition,
  getViewFunctionDefinition,
  ViewFunctionDefinition,
} from './functions';

export type ContractTypeDefinition = {
  contract: string;
  viewFunctions: ViewFunctionDefinition[];
  callFunctions: CallFunctionDefinition[];
  bytecode?: string;
};

const _getFunctionArgs = (f: FunctionDefinitionBase) => {
  return f.hasArgs ? 'args' : '{}';
};

const _getViewFunctions = (functions: ViewFunctionDefinition[]) => {
  return functions
    .map((f) => {
      return `public ${f.fnName}${f.signature} {
      return this.functionView<${f?.argsType?.name ?? 'object'}, ${f.returnType.name}${
        f.returnType.isArray && f.returnType.name !== 'void' ? '[]' : ''
      }>({
          methodName: '${f.contractMethodName}',
          args: ${_getFunctionArgs(f)}
      })
}`;
    })
    .join('\n\n');
};

const _getCallFunctions = (functions: CallFunctionDefinition[], isPrivate: boolean) => {
  return functions.filter(f=>f.isPrivate === isPrivate)
    .map((f) => {
      return `${isPrivate ? `${f.fnName}: async ${f.signature} => ` : `public async ${f.fnName}${f.signature}`}  {
      ${isPrivate ? `if(this.signer?.accountId !== this.contractId) throw new Error('Signer is not a contract');` : ''}
      return this.functionCall<${f?.argsType?.name ?? 'object'}>({
          methodName: '${f.contractMethodName}',
          overrides,
          args: ${_getFunctionArgs(f)}
      })
  }${isPrivate ? ',' : ''}`;
    })
    .join('\n\n');
};

const _getContractTypeDefinition = ({
  contractName,
  byteCode,
  viewFunctions,
  callFunctions,
}: {
  contractName: string;
  byteCode?: string;
  viewFunctions: ViewFunctionDefinition[];
  callFunctions: CallFunctionDefinition[];
}) => {
  return `class ${contractName} extends ${NearContractBase.name} {

constructor(contractId: string, signerAccount: IAccount) {
  super(contractId, signerAccount);
}

public connect(account: IAccount): ${contractName} {
  return new ${contractName}(this.contractId, account);
}
  
${_getViewFunctions(viewFunctions)}

${_getCallFunctions(callFunctions, false)}


${
  (()=>{
    if(callFunctions.filter(v=>v.isPrivate === true).length)
      return `
        public privateCall = {
          ${_getCallFunctions(callFunctions, true)}
        }`
    else return ''
  })()
}

}`;
};

export const getContractTypeDefinition = (abi: NearContractAbi): ContractTypeDefinition => {
  const preparedViewFunctions = abi.methods.view?.map(f => getViewFunctionDefinition(abi, f)) ?? [];
  const preparedCallFunctions = abi.methods.call?.map(f=>getCallFunctionDefinition(abi, f)) ?? [];

  const contractName = abi.contractName;

  return {
    contract: _getContractTypeDefinition({
      contractName,
      viewFunctions: preparedViewFunctions,
      callFunctions: preparedCallFunctions,
      byteCode: abi.byteCode,
    }),
    viewFunctions: preparedViewFunctions,
    callFunctions: preparedCallFunctions,
    bytecode: abi.byteCode,
  };
};