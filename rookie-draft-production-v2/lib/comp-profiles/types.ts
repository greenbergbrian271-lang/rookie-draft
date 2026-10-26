export type CompProfile={name:string;position:"QB"|"RB"|"WR"|"TE";college:string;draftClass:number;draftResult:string;fields:{group:string;label:string;value:number}[]};

/** Stats/analytics for a player who already has a scouting profile; merged only into the comp pool, only for labels the site data lacks. */
export type CompOverlay={name:string;position:"QB"|"RB"|"WR"|"TE";draftClass:number;fields:{group:string;label:string;value:number}[]};
