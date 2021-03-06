import { inject, named } from 'inversify';
import { controller, httpGet, httpPost, httpPut, httpDelete, response, requestBody, requestParam } from 'inversify-express-utils';
import { Types, Core, Targets } from '../../constants';
import { app } from '../../app';
import { ItemCategoryService } from '../services/ItemCategoryService';
import { Logger as LoggerType } from '../../core/Logger';

// Get middlewares
const restApi = app.IoC.getNamed<interfaces.Middleware>(Types.Middleware, Targets.Middleware.RestApiMiddleware);

@controller('/item-categories', restApi.use)
export class ItemCategoryController {

    public log: LoggerType;

    constructor(
        @inject(Types.Service) @named(Targets.Service.ItemCategoryService) private itemCategoryService: ItemCategoryService,
        @inject(Types.Core) @named(Core.Logger) public Logger: typeof LoggerType) {
        this.log = new Logger(__filename);
    }

    @httpGet('/')
    public async findAll( @response() res: myExpress.Response): Promise<any> {
        const itemCategorys = await this.itemCategoryService.findAll();
        this.log.debug('findAll: ', JSON.stringify(itemCategorys, null, 2));
        return res.found(itemCategorys.toJSON());
    }

    @httpPost('/')
    public async create( @response() res: myExpress.Response, @requestBody() body: any): Promise<any> {
        const itemCategory = await this.itemCategoryService.create(body);
        this.log.debug('create: ', JSON.stringify(itemCategory, null, 2));
        return res.created(itemCategory.toJSON());
    }

    @httpGet('/:id')
    public async findOne( @response() res: myExpress.Response, @requestParam('id') id: string): Promise<any> {
        const itemCategory = await this.itemCategoryService.findOne(parseInt(id, 10));
        this.log.debug('findOne: ', JSON.stringify(itemCategory, null, 2));
        return res.found(itemCategory.toJSON());
    }

    @httpPut('/:id')
    public async update( @response() res: myExpress.Response, @requestParam('id') id: string, @requestBody() body: any): Promise<any> {
        const itemCategory = await this.itemCategoryService.update(parseInt(id, 10), body);
        this.log.debug('update: ', JSON.stringify(itemCategory, null, 2));
        return res.updated(itemCategory.toJSON());
    }

    @httpDelete('/:id')
    public async destroy( @response() res: myExpress.Response, @requestParam('id') id: string): Promise<any> {
        await this.itemCategoryService.destroy(parseInt(id, 10));
        this.log.debug('destroy: ', parseInt(id, 10));
        return res.destroyed();
    }
    // Implement your routes here
}
