import { Arg, Resolver, Query, Authorized, Ctx, Mutation, InputType, Field } from 'type-graphql';
import { Beacon, Campaign, Host, GlobalOperator, Server, ServerType } from '@redeye/models';
import { connectToProjectEmOrFail, getMainEmOrFail } from './utils/project-db';
import { RelationPath } from './utils/relation-path';
import type { Relation } from './utils/relation-path';
import type { GraphQLContext } from '../types';
import { OperatorResolvers } from './operator-resolvers';

@InputType()
class ServerUpdateInput {
	@Field(() => String, { nullable: true })
	parsingPath?: string;

	@Field(() => String, { nullable: true })
	name?: string;

	@Field(() => String, { nullable: true })
	displayName?: string;
}

@Resolver(Server)
export class ServerResolvers {
	@Authorized()
	@Query(() => [Server], { nullable: 'itemsAndList', description: 'Get the list of servers for a project' })
	async servers(
		@Ctx() ctx: GraphQLContext,
		@Arg('campaignId', () => String) campaignId: string,
		@Arg('username', () => String) username: string,
		@Arg('hidden', () => Boolean, { defaultValue: false, nullable: true, description: 'Should show hidden values' })
		hidden: boolean = false,
		@RelationPath() relationPaths: Relation<Server>
	): Promise<Server[]> {
		const projectEm = await connectToProjectEmOrFail(campaignId, ctx);
		const em = getMainEmOrFail(ctx);

		let operator = await em.findOne(GlobalOperator, username);
		if (!operator) {
			operator = await OperatorResolvers.createGlobalOperatorHandler(ctx, username);
		}
		try {
			await em.nativeUpdate(Campaign, { id: campaignId }, { lastOpenedBy: operator });
		} catch (e) {
			console.debug(e);
		}
		const servers = await projectEm.find(Server, !hidden ? { hidden, beacons: { hidden } } : {}, {
			populate: relationPaths,
		});
		for (const server of servers) await server.beacons.init({ where: !hidden ? { hidden } : {} });
		ctx.cm.forkMain();
		return servers;
	}

	@Authorized()
	@Mutation(() => Boolean)
	async serversParse(
		@Ctx() ctx: GraphQLContext,
		@Arg('campaignId', () => String) campaignId: string
	): Promise<boolean> {
		if (ctx.config.blueTeam) throw new Error('Parsing cannot be invoked from blue team mode');
		await connectToProjectEmOrFail(campaignId, ctx);
		ctx.messengerMachine.send({ type: 'PARSE_CAMPAIGN', campaignId, context: ctx });
		return true;
	}

	@Authorized()
	@Mutation(() => Server, { description: 'Toggle server hidden state' })
	async toggleServerHidden(
		@Ctx() ctx: GraphQLContext,
		@Arg('campaignId', () => String) campaignId: string,
		@Arg('serverId', () => String) serverId: string
	): Promise<Server> {
		const em = await connectToProjectEmOrFail(campaignId, ctx);
		const server = await em.findOneOrFail(Server, serverId);
		server.hidden = !server.hidden;
		await server.beacons.init();
		for (const beacon of server.beacons) {
			await em.nativeUpdate(Beacon, { id: beacon.id }, { hidden: server.hidden });
			await em.nativeUpdate(Host, { id: beacon.host?.id }, { hidden: server.hidden });
		}
		await em.persistAndFlush(server);
		ctx.cm.forkProject(campaignId);
		return server;
	}

	@Authorized()
	@Mutation(() => Server, { description: 'Update existing Server name' })
	async updateServerMetadata(
		@Ctx() ctx: GraphQLContext,
		@RelationPath() relationPaths: Relation<Server>,
		@Arg('serverId', () => String) serverId: string,
		@Arg('campaignId', () => String) campaignId: string,
		@Arg('serverDisplayName', () => String, { nullable: true }) serverDisplayName?: string,
		@Arg('serverType', () => ServerType, { nullable: true }) serverType?: ServerType
	): Promise<Server> {
		const em = await connectToProjectEmOrFail(campaignId, ctx);
		const server = await em.findOneOrFail(Server, serverId, { populate: relationPaths });
		if (serverDisplayName) {
			server.displayName = serverDisplayName;
			await em.nativeUpdate(
				Beacon,
				{ host: { cobaltStrikeServer: true }, server: serverId },
				{ displayName: serverDisplayName }
			);
			await em.nativeUpdate(
				Host,
				{ cobaltStrikeServer: true, beacons: { server: serverId } },
				{ displayName: serverDisplayName }
			);
		}
		if (serverType) {
			server.meta.type = serverType;
		}
		await em.persistAndFlush(server);

		return server;
	}

	@Authorized()
	@Mutation(() => Server, {
		description:
			'Add a server to a campaign without uploading the files to the server. Intended specifically for live parsing.',
	})
	async serverFolderCreate(
		@Ctx() ctx: GraphQLContext,
		@Arg('campaignId', () => String) campaignId: UUID,
		@Arg('name', () => String) name: string,
		@Arg('path', () => String) path: string
	): Promise<Server> {
		const em = await connectToProjectEmOrFail(campaignId, ctx);
		const server = new Server({ name, parsingPath: path });
		await em.persistAndFlush(server);

		return server;
	}

	@Authorized()
	@Mutation(() => Server, {
		description:
			'Add a server to a campaign without uploading the files to the server. Intended specifically for live parsing.',
	})
	async serverUpdate(
		@Ctx() ctx: GraphQLContext,
		@Arg('campaignId', () => String) campaignId: UUID,
		@Arg('serverId', () => String) serverId: UUID,
		@Arg('input', () => ServerUpdateInput) input: ServerUpdateInput
	): Promise<Server> {
		const em = await connectToProjectEmOrFail(campaignId, ctx);
		const server = await em.findOneOrFail(Server, serverId, { populate: false });

		const { displayName, name, parsingPath } = input;

		if (parsingPath) server.parsingPath = parsingPath;
		if (name) server.name = name;
		if (displayName) server.displayName = displayName;

		await em.persistAndFlush(server);
		ctx.cm.forkProject(campaignId);
		return server;
	}
}
