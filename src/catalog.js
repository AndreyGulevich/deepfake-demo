export function unavailable(id,label,location,reason) {
  return {id,label,location,check:async(env)=>({available:false,reason:
    location==='browser' && !env.secure ? 'Для захвата видео нужен защищённый контекст' :
    reason + (env.ua?.os?.name ? ' · '+env.ua.os.name : '')}),
    async start(){throw new Error(reason)},stop(){}};
}
export function factory(adapters) {
  return {
    async options(env) {
      return Promise.all(adapters.map(async ({id,label,location,check})=>{
        let status;
        try { status = await check(env); } catch (error) { status = {available:false,reason:error.message}; }
        return {id,label,location,...status};
      }));
    },
    get(id) {
      const adapter = adapters.find(item=>item.id===id);
      if (!adapter) throw new Error('Неизвестная реализация');
      return adapter;
    }
  };
}
